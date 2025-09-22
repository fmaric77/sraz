import { NextRequest, NextResponse } from 'next/server';
import { getLobby, joinLobby, startLobby, attachGameToLobby } from '@/lib/lobby';
import { publishLobbyEvent } from '@/lib/realtime';
import { createNewGame } from '@/lib/board';
import { getCollection } from '@/lib/db';
import { Game } from '@/models/types';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean); // ['api','lobbies',':code']
  const codeIndex = segments.indexOf('lobbies') + 1;
  const code = segments[codeIndex];
  if (!code) return NextResponse.json({ error: 'BAD_PATH' }, { status: 400 });
  const lobby = await getLobby(code);
  if (!lobby) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ lobby });
}

// POST /api/lobbies/[code] with { action: 'join' | 'start', userId? }
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean); // ['api','lobbies',':code']
  const codeIndex = segments.indexOf('lobbies') + 1;
  const code = segments[codeIndex];
  if (!code) return NextResponse.json({ error: 'BAD_PATH' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action === 'join') {
    const userId = body.userId || 'anon-' + Math.random().toString(36).slice(2,8);
    const result = await joinLobby(code, userId);
    if ('error' in result) return NextResponse.json(result, { status: 400 });
    await publishLobbyEvent(code, 'player.joined', { userId });
    return NextResponse.json({ lobby: result, userId });
  }
  if (action === 'start') {
    const { lobby, error } = await startLobby(code);
    if (error || !lobby) return NextResponse.json({ error: error || 'UNKNOWN' }, { status: 400 });
    if (lobby.players.length < 2) {
      return NextResponse.json({ error: 'MIN_PLAYERS', message: 'At least 2 players required to start.' }, { status: 400 });
    }
    // Create and persist game
    const game: Game & { _id: string } = { ...createNewGame({ creatorUserId: lobby.players[0].userId, explicitPlayers: lobby.players.map(p => ({ userId: p.userId, team: p.team })) }), _id: randomUUID() };
    const gamesCol = await getCollection<Game>('games');
    await gamesCol.insertOne(game);
    await attachGameToLobby(code, game._id);
    await publishLobbyEvent(code, 'lobby.started', { gameId: game._id });
    return NextResponse.json({ gameId: game._id });
  }
  return NextResponse.json({ error: 'BAD_ACTION' }, { status: 400 });
}
