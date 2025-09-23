import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Game, Piece, User } from '@/models/types';
import { publishGameEvent } from '@/lib/realtime';
import { resolveCombatAndMove, CombatEvent } from '@/lib/combat';
import { BOARD_SIZE } from '@/lib/board';
import { updateEloMulti } from '@/lib/elo';
import { updateUserEloAndRecord } from '@/lib/users';
import { GameResult } from '@/models/types';
import { finalizeGameAndBroadcast } from '@/lib/gameFinish';

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
  // Guard: cannot move if a pendingQuestion exists (must answer via attempt flow)
  if (game.pendingQuestion) {
    // TTL auto-clear if expired
    const createdAt = game.pendingQuestion.requestedAt ? new Date(game.pendingQuestion.requestedAt).getTime() : 0;
    if (createdAt && Date.now() - createdAt > 45_000) {
      await gamesCol.updateOne({ _id: id }, { $set: { pendingQuestion: null } });
    } else {
      return NextResponse.json({ error: 'QUESTION_PENDING' }, { status: 409 });
    }
  }
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
  if (piece.isFlag) {
    return NextResponse.json({ error: 'FLAG_IMMOBILE' }, { status: 400 });
  }
  if ((dx === 0 && dy === 0) || dx > 1 || dy > 1 || toX < 0 || toX >= BOARD_SIZE || toY < 0 || toY >= BOARD_SIZE) {
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
  const flagCapture = events.find(e => e.type === 'flag-capture') as (CombatEvent & { type: 'flag-capture'; flagTeam: string; attackerTeam: string }) | undefined;
  const gameEnded = aliveTeamsFinal.length === 1 || !!flagCapture;
  let winnerTeam: Game['players'][number]['team'] | null = null;
  if (gameEnded) {
    if (flagCapture) {
      winnerTeam = flagCapture.attackerTeam as Game['players'][number]['team'];
    } else {
      winnerTeam = aliveTeamsFinal[0] as Game['players'][number]['team'];
    }
  }

  if (!gameEnded) {
    await gamesCol.updateOne({ _id: id }, { $set: { pieces: updatedPieces, turnOfUserId: nextUser } });
    await publishGameEvent(id, 'game.move', { pieceId, toX, toY, events, nextTurnUserId: nextUser, pieces: updatedPieces });
    return NextResponse.json({ ok: true });
  }

  const { rated, eloResults } = await finalizeGameAndBroadcast({ game, gameId: id, updatedPieces, winnerTeam, flagCapture: !!flagCapture });
  return NextResponse.json({ ok: true, finished: true, winnerTeam, rated, eloResults });
}