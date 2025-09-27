import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { createNewGame } from '@/lib/board';
import { Game, Team } from '@/models/types';
import { publishMatchmakingEvent, getAblyRest } from '@/lib/realtime';
import { generateAccessToken } from '@/lib/tokens';
import { auth } from '@/auth';
import { randomUUID } from 'crypto';

// 30 second collection window
const WINDOW_MS = 30_000;
const TEAM_ORDER: Team[] = ['A','B','C','D'];

interface MatchWindowPlayer {
  userId: string;
  joinedAt: Date;
}

interface MatchWindowDoc {
  _id?: string;
  status: 'collecting' | 'started';
  startedAt: Date; // window start timestamp
  players: MatchWindowPlayer[];
  gameId?: string;
}

interface ExtendedSession {
  user?: { name?: string | null; email?: string | null };
  userId?: string; // enriched in auth callback
  elo?: number;
}

async function startGameFromWindow(windowDoc: MatchWindowDoc): Promise<{ gameId: string; game: Game } | null> {
  if (windowDoc.players.length < 2) return null; // cannot start
  const gamesCol = await getCollection<Game>('games');
  // Assign teams in order of join
  const explicitPlayers = windowDoc.players.slice(0, 4).map((p, idx) => ({ userId: p.userId, team: TEAM_ORDER[idx] }));
  const game: Game & { _id: string } = { ...createNewGame({ creatorUserId: explicitPlayers[0].userId, explicitPlayers }), _id: randomUUID() };
  // Generate per-user access tokens
  game.accessTokens = explicitPlayers.map(p => ({ userId: p.userId, token: generateAccessToken() }));
  await gamesCol.insertOne(game as unknown as Game);
  // Mark window started (best effort; ignore race if already updated)
  const mmCol = await getCollection<MatchWindowDoc>('matchmaking');
  await mmCol.updateOne({ _id: windowDoc._id }, { $set: { status: 'started', gameId: game._id } });
  await publishMatchmakingEvent('mm.started', {
    gameId: game._id,
    playerCount: explicitPlayers.length,
    players: explicitPlayers,
    tokens: (game.accessTokens || []).map(t => ({ userId: t.userId, token: t.token }))
  });
  return { gameId: game._id, game };
}

// POST /api/matchmaking  body: { action: 'join' | 'cancel' }
// Joins the random matchmaking queue and returns either waiting status or started game id.
export async function POST(req: NextRequest) {
  const body: { action?: 'join'|'cancel'|'forceStart'; userId?: string } = await req.json().catch(() => ({} as { action?: 'join'|'cancel'|'forceStart'; userId?: string }));
  if (body.action && !['join','cancel','forceStart'].includes(body.action)) {
    return NextResponse.json({ error: 'BAD_ACTION' }, { status: 400 });
  }
  // Resolve user identity: authenticated user id preferred else provided body.userId else anon
  let userId: string | undefined = body.userId;
  try {
    const session = (await auth()) as ExtendedSession | null;
    if (session?.userId) userId = session.userId;
  } catch {}
  if (!userId) userId = 'anon-' + Math.random().toString(36).slice(2, 10);

  const mmCol = await getCollection<MatchWindowDoc>('matchmaking');

  // Attempt to fetch current collecting window (oldest collecting doc)
  let windowDoc = await mmCol.findOne({ status: 'collecting' }, { sort: { startedAt: 1 } });
  const now = Date.now();

  // Helper to compute remaining time
  function remainingMs(doc: MatchWindowDoc) {
    return Math.max(0, WINDOW_MS - (now - new Date(doc.startedAt).getTime()));
  }

  // If no active window, create one with this user
  // Presence authoritative mode: cancellation == client should leave presence channel; we just acknowledge.
  if (body.action === 'cancel') {
    return NextResponse.json({ status: 'cancelled', userId, note: 'Leave Ably presence (matchmaking-window) to fully cancel.' });
  }

  const ably = getAblyRest();
  if (!ably) {
    return NextResponse.json({ error: 'ABLY_NOT_CONFIGURED', message: 'Presence-based matchmaking requires ABLY_API_KEY.' }, { status: 500 });
  }

  // Fetch presence members (source of truth)
  let presencePlayers: MatchWindowPlayer[] = [];
  try {
    const channel = ably.channels.get('matchmaking-window');
    const raw = await channel.presence.get();
    // raw may be PaginatedResult<PresenceMessage> or array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members: any[] = Array.isArray(raw) ? raw : ((raw as any).items || raw || []);
    presencePlayers = members.map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = (m as { data?: unknown }).data || {};
      const joined = data.joinedAt ? new Date(data.joinedAt) : new Date();
      const uid = data.userId || data.userID || (m as { clientId?: string }).clientId || 'unknown';
      return { userId: uid, joinedAt: joined };
    }).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  } catch (e) {
    console.error('[matchmaking] presence.get failed', e);
  }

  // Build / update collecting window based on presence
  if (!windowDoc) {
    // If no players in presence yet, wait until at least one joins
    if (presencePlayers.length === 0) {
      return NextResponse.json({ status: 'idle', players: 0, userId, awaitingPresence: true });
    }
    const newDoc: MatchWindowDoc = { status: 'collecting', startedAt: new Date(), players: presencePlayers };
  const res = await mmCol.insertOne(newDoc as unknown as MatchWindowDoc);
  newDoc._id = res.insertedId.toString();
    await publishMatchmakingEvent('mm.update', { players: presencePlayers.length, timeRemainingMs: WINDOW_MS });
  windowDoc = newDoc as MatchWindowDoc & { _id: string };
  } else {
    // Reconcile: replace players with presence ordering
    if (presencePlayers.length === 0) {
      // If presence empty, we can consider clearing the window (soft reset)
  await mmCol.deleteOne({ _id: windowDoc._id, status: 'collecting' } as { _id: string; status: 'collecting' });
      return NextResponse.json({ status: 'idle', players: 0, userId, awaitingPresence: true });
    }
    const prevPlayerIds = windowDoc.players.map(p=>p.userId);
    const newPlayerIds = presencePlayers.map(p=>p.userId);
    const changed = JSON.stringify(prevPlayerIds) !== JSON.stringify(newPlayerIds);
    let resetTimer = false;
    if (changed) {
      // Detect growth (a new player joined) -> reset timer to give full 30s for an additional player (unless already at capacity 4)
      if (newPlayerIds.length > prevPlayerIds.length && newPlayerIds.length < 4) {
        resetTimer = true;
      }
  const update: Partial<MatchWindowDoc> = { players: presencePlayers };
      if (resetTimer) {
        update.startedAt = new Date();
        windowDoc.startedAt = update.startedAt;
      }
      await mmCol.updateOne({ _id: windowDoc._id, status: 'collecting' }, { $set: update });
      windowDoc.players = presencePlayers;
      if (resetTimer) {
        // Broadcast full reset to clients
        await publishMatchmakingEvent('mm.update', { players: presencePlayers.length, timeRemainingMs: WINDOW_MS });
      }
    }
  }

  // After reconciliation we may receive a manual force start request.
  if (body.action === 'forceStart') {
    const wd = windowDoc as MatchWindowDoc;
    // Re-fetch presence ordering to ensure up-to-date authoritative first player
    let presencePlayers: MatchWindowPlayer[] = [];
    try {
      const channel = ably.channels.get('matchmaking-window');
      const raw = await channel.presence.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members: any[] = Array.isArray(raw) ? raw : ((raw as any).items || raw || []);
      presencePlayers = members.map((m) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = (m as { data?: unknown }).data || {};
        const joined = data.joinedAt ? new Date(data.joinedAt) : new Date();
        const uid = data.userId || data.userID || (m as { clientId?: string }).clientId || 'unknown';
        return { userId: uid, joinedAt: joined };
      }).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    } catch {}
    if (!presencePlayers.length) {
      return NextResponse.json({ error: 'EMPTY', message: 'No players in queue.' }, { status: 400 });
    }
    if (presencePlayers[0].userId !== userId) {
      return NextResponse.json({ error: 'NOT_AUTHORIZED', message: 'Only first player may start early.' }, { status: 403 });
    }
    if (presencePlayers.length < 2) {
      return NextResponse.json({ error: 'INSUFFICIENT_PLAYERS', message: 'Need at least 2 players to start.' }, { status: 400 });
    }
    // Use current window doc (already reconciled) – ensure players list matches presence list
    wd.players = presencePlayers;
    const started = await startGameFromWindow(wd);
    if (started) {
      const team = TEAM_ORDER[wd.players.findIndex(p => p.userId === userId)];
      const token = started.game.accessTokens?.find(t => t.userId === userId)?.token;
      return NextResponse.json({ status: 'started', gameId: started.gameId, userId, team, token, forced: true });
    }
    return NextResponse.json({ error: 'START_FAILED' }, { status: 500 });
  }

  // At this point windowDoc exists and is reconciled. Determine if user is in presence roster.
  const wd = windowDoc as MatchWindowDoc; // non-null assertion after setup
  const inQueue = wd.players.some(p => p.userId === userId);
  if (!inQueue) {
    // User hasn't joined presence yet; instruct client to enter presence first.
    return NextResponse.json({ status: 'awaitingPresence', message: 'Join Ably presence channel matchmaking-window then retry.', userId });
  }

  // Check expiration of existing window FIRST
  const expired = remainingMs(wd) === 0;
  if (expired) {
    if (wd.players.length >= 2) {
      const started = await startGameFromWindow(wd);
      if (started && wd.players.some(p => p.userId === userId)) {
        const team = TEAM_ORDER[wd.players.findIndex(p => p.userId === userId)];
        const token = started.game.accessTokens?.find(t => t.userId === userId)?.token;
        return NextResponse.json({ status: 'started', gameId: started.gameId, team, userId, token });
      }
      // If user was not in started game, they must join presence after game start for next window.
      return NextResponse.json({ status: 'idle', message: 'Window consumed; rejoin presence for next match.', userId });
    } else {
      // Not enough players -> reset timer on same doc, optionally add new user if missing
  await mmCol.updateOne({ _id: (wd as unknown as { _id: string })._id, status: 'collecting' }, { $set: { startedAt: new Date() } });
      wd.startedAt = new Date();
    }
  }

  // Add user to current collecting window (if capacity remains)
  // Immediate start if player count hits 4
  if (wd.players.length >= 4) {
    const started = await startGameFromWindow(wd);
    if (started) {
      const team = TEAM_ORDER[wd.players.findIndex(p => p.userId === userId)];
      const token = started.game.accessTokens?.find(t => t.userId === userId)?.token;
      return NextResponse.json({ status: 'started', gameId: started.gameId, team, userId, token });
    }
  }

  // Expiration start
  if (expired && wd.players.length >= 2) {
    const started = await startGameFromWindow(wd);
    if (started) {
      const team = TEAM_ORDER[wd.players.findIndex(p => p.userId === userId)];
      const token = started.game.accessTokens?.find(t => t.userId === userId)?.token;
      return NextResponse.json({ status: 'started', gameId: started.gameId, team, userId, token });
    }
  } else if (expired && wd.players.length < 2) {
    // Reset window start time to extend collection period
  await mmCol.updateOne({ _id: (wd as unknown as { _id: string })._id, status: 'collecting' }, { $set: { startedAt: new Date() } });
    wd.startedAt = new Date();
  }

  await publishMatchmakingEvent('mm.update', { players: wd.players.length, timeRemainingMs: remainingMs(wd) });
  return NextResponse.json({ status: 'waiting', players: wd.players.length, timeRemainingMs: remainingMs(wd), userId });
}

// Optional GET to poll queue status (simpler for client than keeping long polling)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const mmCol = await getCollection<MatchWindowDoc>('matchmaking');
  let windowDoc = await mmCol.findOne({ status: 'collecting' }, { sort: { startedAt: 1 } });
  const ably = getAblyRest();
  if (!ably) return NextResponse.json({ status: 'idle', error: 'ABLY_NOT_CONFIGURED' });
  const channel = ably.channels.get('matchmaking-window');
  let presencePlayers: MatchWindowPlayer[] = [];
  try {
    const raw = await channel.presence.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members: any[] = Array.isArray(raw) ? raw : ((raw as any).items || raw || []);
    presencePlayers = members.map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = (m as { data?: unknown; clientId?: string }).data || {};
      return { userId: data.userId || (m as { clientId?: string }).clientId || 'unknown', joinedAt: new Date(data.joinedAt || Date.now()) };
    }).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  } catch (e) {
    console.error('[matchmaking][GET] presence.get failed', e);
  }
  if (!windowDoc && presencePlayers.length === 0) return NextResponse.json({ status: 'idle' });
  if (!windowDoc && presencePlayers.length > 0) {
    const newDoc: MatchWindowDoc = { status: 'collecting', startedAt: new Date(), players: presencePlayers };
  const res = await mmCol.insertOne(newDoc as unknown as MatchWindowDoc);
    newDoc._id = res.insertedId.toString();
  windowDoc = newDoc as MatchWindowDoc & { _id: string };
  }
  if (windowDoc && presencePlayers.length === 0) {
  await mmCol.deleteOne({ _id: windowDoc._id, status: 'collecting' } as { _id: string; status: 'collecting' });
    return NextResponse.json({ status: 'idle' });
  }
  if (windowDoc && presencePlayers.length > 0) {
    const prevIds = windowDoc.players.map(p=>p.userId);
    const newIds = presencePlayers.map(p=>p.userId);
    const changed = JSON.stringify(prevIds) !== JSON.stringify(newIds);
    let resetTimer = false;
    if (changed) {
      if (newIds.length > prevIds.length && newIds.length < 4) {
        resetTimer = true;
      }
  const update: Partial<MatchWindowDoc> = { players: presencePlayers };
      if (resetTimer) {
        update.startedAt = new Date();
        windowDoc.startedAt = update.startedAt;
      }
      await mmCol.updateOne({ _id: windowDoc._id, status: 'collecting' }, { $set: update });
      windowDoc.players = presencePlayers;
      if (resetTimer) {
        await publishMatchmakingEvent('mm.update', { players: presencePlayers.length, timeRemainingMs: WINDOW_MS });
      }
    }
  }
  if (!windowDoc) return NextResponse.json({ status: 'idle' });
  const now = Date.now();
  const remaining = Math.max(0, WINDOW_MS - (now - new Date(windowDoc.startedAt).getTime()));
  // Auto-start attempt if time elapsed and at least 2 players (cron-less safeguard)
  if (remaining === 0 && windowDoc.players.length >= 2) {
    const started = await startGameFromWindow(windowDoc);
    if (started && userId && windowDoc.players.some(p => p.userId === userId)) {
      const team = TEAM_ORDER[windowDoc.players.findIndex(p => p.userId === userId)];
      const token = started.game.accessTokens?.find(t => t.userId === userId)?.token;
      return NextResponse.json({ status: 'started', gameId: started.gameId, team, userId, token });
    }
    if (started) {
      return NextResponse.json({ status: 'started', gameId: started.gameId });
    }
  }
  if (userId && windowDoc.players.some(p => p.userId === userId)) {
    return NextResponse.json({ status: 'waiting', players: windowDoc.players.length, timeRemainingMs: remaining, userId });
  }
  return NextResponse.json({ status: 'observing', players: windowDoc.players.length, timeRemainingMs: remaining });
}

// DELETE /api/matchmaking?cleanup=1  -> manual cleanup of stale collecting docs (housekeeping)
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.searchParams.get('cleanup')) return NextResponse.json({ error: 'BAD_ACTION' }, { status: 400 });
  // Simple admin check via env configured email list (comma separated)
  const session = await auth().catch(() => null) as { user?: { email?: string | null } } | null;
  const adminList = (process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim()).filter(Boolean);
  if (!session?.user?.email || !adminList.includes(session.user.email)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const mmCol = await getCollection<MatchWindowDoc>('matchmaking');
  const cutoff = new Date(Date.now() - 10 * WINDOW_MS); // windows older than 5 minutes if unstarted
  const res = await mmCol.deleteMany({ status: 'collecting', startedAt: { $lt: cutoff } });
  return NextResponse.json({ cleaned: res.deletedCount });
}
