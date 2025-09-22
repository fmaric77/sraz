import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Game, Piece, User } from '@/models/types';
import { publishGameEvent } from '@/lib/realtime';
import { resolveCombatAndMove } from '@/lib/combat';
import { updateEloMulti } from '@/lib/elo';
import { updateUserEloAndRecord } from '@/lib/users';
import { GameResult } from '@/models/types';

// POST /api/games/:id/move { pieceId, toX, toY, userId }
interface MoveBody { pieceId?: string; toX?: number; toY?: number; userId?: string }
// Use a named context parameter (like other dynamic routes) to satisfy Next.js route type validation.
export async function POST(req: NextRequest) {
  // Derive the game id from the URL (path: /api/games/:id/move)
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // Expect segments like ['api','games',':id','move']
  const idIndex = segments.indexOf('games') + 1;
  const id = segments[idIndex];
  if (!id) {
    return NextResponse.json({ error: 'BAD_PATH' }, { status: 400 });
  }
  const body: MoveBody = await req.json().catch(() => ({} as MoveBody));
  const { pieceId, toX, toY, userId } = body;
  if (!pieceId || typeof toX !== 'number' || typeof toY !== 'number' || !userId) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }
  const gamesCol = await getCollection<Game>('games');
  const game = await gamesCol.findOne({ _id: id });
  if (!game) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  // Membership check
  if (!game.players.some(p => p.userId === userId)) {
    return NextResponse.json({ error: 'NOT_IN_GAME' }, { status: 403 });
  }
  // Turn check
  if (game.turnOfUserId !== userId) {
    return NextResponse.json({ error: 'NOT_YOUR_TURN' }, { status: 409 });
  }
  // Find piece
  const piece = game.pieces.find(p => p.id === pieceId && p.alive);
  if (!piece) return NextResponse.json({ error: 'PIECE_NOT_FOUND' }, { status: 404 });
  // Basic adjacency check (reuse simple logic inline)
  const dx = Math.abs(piece.x - toX); const dy = Math.abs(piece.y - toY);
  if ((dx === 0 && dy === 0) || dx > 1 || dy > 1 || toX < 0 || toX > 7 || toY < 0 || toY > 7) {
    return NextResponse.json({ error: 'ILLEGAL_MOVE' }, { status: 400 });
  }
  // Resolve combat rules using shared logic
  const { pieces: updatedPieces, events } = resolveCombatAndMove({ pieces: game.pieces as Piece[], attackerId: pieceId, toX, toY, blackHoles: game.blackHoles });
  // Compute next turn (cycle through alive teams)
  const aliveTeams = Array.from(new Set(updatedPieces.filter(p=>p.alive).map(p=>p.team)));
  const canonicalOrder: Game['players'][number]['team'][] = ['A','B','C','D'];
  const teamOrder = canonicalOrder.filter(t => (aliveTeams as typeof canonicalOrder).includes(t));
  const currentTeam = game.players.find(p => p.userId === userId)!.team;
  const idx = teamOrder.indexOf(currentTeam);
  const nextTeam = teamOrder[(idx + 1) % teamOrder.length];
  const nextUser = game.players.find(p => p.team === nextTeam)?.userId || userId;
  // Determine if game ended: only one team remains alive
  const aliveTeamsFinal = Array.from(new Set(updatedPieces.filter(p=>p.alive).map(p=>p.team)));
  const gameEnded = aliveTeamsFinal.length === 1;
  let winnerTeam: Game['players'][number]['team'] | null = null;
  if (gameEnded) winnerTeam = aliveTeamsFinal[0] as Game['players'][number]['team'];

  if (!gameEnded) {
    await gamesCol.updateOne({ _id: id }, { $set: { pieces: updatedPieces, turnOfUserId: nextUser } });
    await publishGameEvent(id, 'game.move', { pieceId, toX, toY, events, nextTurnUserId: nextUser, pieces: updatedPieces });
    return NextResponse.json({ ok: true });
  }

  // Game finished: gather player elos for update.
  // Fetch users collection for elo (players may not all be registered). Only rated if all players are registered users.
  const allPlayerIds = game.players.map(p=>p.userId);
  const usersCol = await getCollection<User>('users');
  const userDocs = await usersCol.find({ _id: { $in: allPlayerIds } }).toArray();
  const rated = userDocs.length === allPlayerIds.length; // only if all participants registered
  let eloResults: { userId: string; preElo: number; postElo: number; delta: number; result: 'win' | 'loss' | 'draw' | 'other'; team: string }[] = [];
  if (rated) {
    // Build score allocation: winner gets 1, others 0 (basic FFA). Future ties could distribute.
  const playerStates = userDocs.map(d => ({ userId: d._id!, preElo: d.elo, score: game.players.find(p=>p.userId===d._id)?.team === winnerTeam ? 1 : 0 }));
    const updated = updateEloMulti(playerStates);
  eloResults = updated.map(r => ({ userId: r.userId, preElo: r.preElo, postElo: r.postElo, delta: r.delta, result: r.score === 1 ? 'win' : 'loss', team: game.players.find(p=>p.userId===r.userId)!.team }));
    // Persist user elo and W/L record
    for (const r of eloResults) {
      await updateUserEloAndRecord(r.userId, r.postElo, { win: r.result==='win', loss: r.result==='loss' });
    }
  }
  // Persist game result summary
  const resultsCol = await getCollection<GameResult>('gameResults');
  await resultsCol.insertOne({
    gameId: id,
    finishedAt: new Date(),
    players: (rated ? eloResults : game.players.map(p=> ({ userId: p.userId, team: p.team, preElo: 0, postElo: 0, result: p.team === winnerTeam ? 'win' : 'other' }))) as unknown as GameResult['players'],
    winnerUserId: game.players.find(p=> p.team === winnerTeam!)?.userId,
    rated
  });
  await gamesCol.updateOne({ _id: id }, { $set: { pieces: updatedPieces, status: 'finished' } });
  await publishGameEvent(id, 'game.finished', { winnerTeam, pieces: updatedPieces, rated, eloResults });
  return NextResponse.json({ ok: true, finished: true, winnerTeam, rated });
}