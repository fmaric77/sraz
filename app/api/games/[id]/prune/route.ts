import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Game, Piece, Team } from '@/models/types';
import { publishGameEvent } from '@/lib/realtime';
import { finalizeGameAndBroadcast } from '@/lib/gameFinish';
import Ably from 'ably';

// POST /api/games/:id/prune { userId, targetUserId }
// Caller userId is used only for auditing; server validates absence using Ably presence.
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const idIndex = parts.indexOf('games') + 1;
    const gameId = parts[idIndex];
    if (!gameId) return NextResponse.json({ error: 'BAD_PATH' }, { status: 400 });
    const body: { userId?: string; targetUserId?: string } = await req.json().catch(()=>({} as { userId?: string; targetUserId?: string }));
    const { userId, targetUserId } = body || {};
    if (!userId || !targetUserId) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    if (userId === targetUserId) return NextResponse.json({ error: 'SELF_PRUNE' }, { status: 400 });

    const gamesCol = await getCollection<Game>('games');
    const game = await gamesCol.findOne({ _id: gameId });
    if (!game) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (game.status === 'finished') return NextResponse.json({ error: 'GAME_FINISHED' }, { status: 409 });
    const targetPlayer = game.players.find(p=>p.userId === targetUserId);
    if (!targetPlayer) return NextResponse.json({ error: 'NOT_IN_GAME' }, { status: 404 });
    // Cleanup stale locks
    if (game.pruneLocks && game.pruneLocks.length) {
      const NOW = Date.now();
      const TTL = 4000;
      const filtered = game.pruneLocks.filter(l => NOW - new Date(l.ts).getTime() < TTL);
      if (filtered.length !== game.pruneLocks.length) {
        await gamesCol.updateOne({ _id: gameId }, { $set: { pruneLocks: filtered } });
  game.pruneLocks = filtered;
      }
    }
    // DB-backed debounce (4s TTL)
    const debounceKey = `${gameId}:${targetUserId}`;
    const now = Date.now();
    const TTL_MS = 4000;
    const existingLocks = (game.pruneLocks || []).filter(l => (now - new Date(l.ts).getTime()) < TTL_MS);
    if (existingLocks.some(l => l.key === debounceKey)) {
      return NextResponse.json({ error: 'DEBOUNCED' }, { status: 429 });
    }
    existingLocks.push({ key: debounceKey, ts: new Date() });
    await gamesCol.updateOne({ _id: gameId }, { $set: { pruneLocks: existingLocks } });

    // Validate absence using Ably presence
    const apiKey = process.env.ABLY_API_KEY || process.env.ABLY_APY_KEY;
    if (!apiKey) return NextResponse.json({ error: 'ABLY_NOT_CONFIGURED' }, { status: 500 });
    const rest = new Ably.Rest(apiKey);
  interface PresenceMember { clientId?: string; data?: { userId?: string; userID?: string }; }
  let members: PresenceMember[] = [];
    try {
      const channel = rest.channels.get(`game-${gameId}`);
    const raw = await channel.presence.get();
    members = Array.isArray(raw) ? raw : (raw?.items ? raw.items : []);
    } catch (e) {
      console.warn('[prune] presence.get failed; proceeding cautiously', e);
    }
    const stillPresent = members.some(m => m?.clientId === targetUserId);
    if (stillPresent) {
      return NextResponse.json({ error: 'STILL_PRESENT' }, { status: 409 });
    }

    // Remove player & kill their pieces
    const newPlayers = game.players.filter(p=>p.userId !== targetUserId);
    const newPieces: Piece[] = game.pieces.map(p => p.team === targetPlayer.team ? { ...p, alive: false } : p);

    // If turn belonged to pruned player, advance turn to next remaining user (cycling teams with alive pieces)
    let nextTurnUserId = game.turnOfUserId;
    if (game.turnOfUserId === targetUserId) {
      const aliveTeams = Array.from(new Set(newPieces.filter(p=>p.alive).map(p=>p.team)));
      const canonical: Team[] = ['A','B','C','D'];
      const order = canonical.filter(t => aliveTeams.includes(t));
      const idx = order.indexOf(targetPlayer.team);
      const nextTeam = order[(idx+1) % order.length];
      nextTurnUserId = newPlayers.find(p=>p.team === nextTeam)?.userId || newPlayers[0]?.userId || targetUserId; // fallback
    }

    // Win condition checks
    const remainingTeams = Array.from(new Set(newPieces.filter(p=>p.alive).map(p=>p.team)));
    // Special two-player original scenario: if game had exactly 2 players at start and we pruned one -> immediate win.
    const originalPlayerCount = game.players.length;
    if (originalPlayerCount <= 2 || remainingTeams.length === 1) {
      // Determine winner team: any alive team, else the team of the remaining player
      let winnerTeam: Team | null = null;
      if (remainingTeams.length === 1) winnerTeam = remainingTeams[0];
      else if (newPlayers.length === 1) winnerTeam = newPlayers[0].team;
      if (winnerTeam) {
        const { rated, eloResults } = await finalizeGameAndBroadcast({ game: { ...game, players: newPlayers }, gameId, updatedPieces: newPieces, winnerTeam, flagCapture: false });
        return NextResponse.json({ ok: true, pruned: true, finished: true, winnerTeam, rated, eloResults });
      }
    }

    await gamesCol.updateOne({ _id: gameId }, { $set: { players: newPlayers, pieces: newPieces, turnOfUserId: nextTurnUserId }, $unset: { pendingQuestion: '' } });
    await publishGameEvent(gameId, 'game.move', { type: 'player.pruned', prunedUserId: targetUserId, pieces: newPieces, players: newPlayers, nextTurnUserId });
    return NextResponse.json({ ok: true, pruned: true, finished: false });
  } catch (e) {
    console.error('Prune route failed', e);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}
