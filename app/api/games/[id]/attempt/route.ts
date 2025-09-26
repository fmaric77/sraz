import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { ObjectId, WithId } from 'mongodb';
import { Game, Piece, Team, Question } from '@/models/types';
import { resolveCombatAndMove, CombatEvent } from '@/lib/combat';
import { publishGameEvent } from '@/lib/realtime';
import { BOARD_SIZE } from '@/lib/board';
import { finalizeGameAndBroadcast } from '@/lib/gameFinish';

// POST /api/games/:id/attempt { userId, pieceId, toX, toY, questionId, answerIndex }
// This endpoint validates turn + pending question, checks answer correctness, and if correct executes the move atomically.
// If incorrect it advances the turn without applying the move. Prevents race between /questions/check and /move.
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const idIndex = segments.indexOf('games') + 1;
    const id = segments[idIndex];
    if (!id) return NextResponse.json({ error: 'BAD_PATH' }, { status: 400 });
    const body = await req.json();
    const { userId, pieceId, toX, toY, questionId, answerIndex } = body || {};
    if (!userId || !pieceId || typeof toX !== 'number' || typeof toY !== 'number' || !questionId || typeof answerIndex !== 'number') {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }
  const gamesCol = await getCollection<Game>('games');
  // Use WithId<Question> to include ObjectId _id field
  const questionsCol = await getCollection<WithId<Question>>('questions');
    const game = await gamesCol.findOne({ _id: id });
    if (!game) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (game.status === 'finished') return NextResponse.json({ error: 'GAME_FINISHED' }, { status: 409 });
    if (game.turnOfUserId !== userId) return NextResponse.json({ error: 'NOT_YOUR_TURN' }, { status: 409 });
    if (!game.players.some(p => p.userId === userId)) return NextResponse.json({ error: 'NOT_IN_GAME' }, { status: 403 });

    // Require a pendingQuestion (strict) and validate it matches
    if (!game.pendingQuestion) {
      return NextResponse.json({ error: 'NO_PENDING' }, { status: 409 });
    }
    if (game.pendingQuestion.questionId !== questionId || game.pendingQuestion.pieceId !== pieceId || game.pendingQuestion.toX !== toX || game.pendingQuestion.toY !== toY) {
      return NextResponse.json({ error: 'MISMATCH_PENDING' }, { status: 409 });
    }
    // TTL check (12s server authoritative; client shows 10s) small buffer for latency
    const PENDING_TTL_MS = 12_000;
    const createdAt = new Date(game.pendingQuestion.requestedAt).getTime();
    if (Date.now() - createdAt > PENDING_TTL_MS) {
      // Expire and clear
      const gamesCol = await getCollection<Game>('games');
      await gamesCol.updateOne({ _id: id }, { $set: { pendingQuestion: null } });
      return NextResponse.json({ error: 'PENDING_EXPIRED' }, { status: 410 });
    }
    // Category integrity: must match board unless Random case
    const boardCat = game.boardCategories[toY]?.[toX];
    const pendingCat = game.pendingQuestion.category;
    if (pendingCat !== 'Random' && boardCat && pendingCat !== boardCat) {
      return NextResponse.json({ error: 'CATEGORY_MISMATCH' }, { status: 409 });
    }

    // Fetch question for correctness
  // Convert string ID to ObjectId to match MongoDB stored _id
  // @ts-expect-error Question._id is declared as string in the shared type but stored as ObjectId in MongoDB
  const qDoc = await questionsCol.findOne({ _id: new ObjectId(questionId) });
  if (!qDoc) return NextResponse.json({ error: 'QUESTION_NOT_FOUND' }, { status: 404 });
    const correct = qDoc.correctIndex === answerIndex;

    // Record history entry
    const turnIndex = game.questionHistory.length + 1;
  const historyEntry = { turn: turnIndex, questionId, correct, category: pendingCat === 'Random' ? (boardCat || 'Random') : pendingCat };

    if (!correct) {
      // Advance turn only
      const aliveTeams = Array.from(new Set(game.pieces.filter(p=>p.alive).map(p=>p.team)));
      const canonical: Game['players'][number]['team'][] = ['A','B','C','D'];
      const order = canonical.filter(t => (aliveTeams as typeof canonical).includes(t));
      const currentTeam = game.players.find(p=>p.userId===userId)!.team;
      const idx = order.indexOf(currentTeam);
      const nextTeam = order[(idx+1)%order.length];
      const nextUser = game.players.find(p=>p.team===nextTeam)!.userId;
      await gamesCol.updateOne({ _id: id }, { $set: { turnOfUserId: nextUser, pendingQuestion: null }, $push: { questionHistory: historyEntry } });
      await publishGameEvent(id, 'game.turn', { nextTurnUserId: nextUser, incorrect: true });
      return NextResponse.json({ ok: true, correct: false, nextTurnUserId: nextUser });
    }

    // Correct: execute move logic similar to move endpoint
    const piece = game.pieces.find(p => p.id === pieceId && p.alive);
    if (!piece) return NextResponse.json({ error: 'PIECE_NOT_FOUND' }, { status: 404 });
    if (piece.isFlag) return NextResponse.json({ error: 'FLAG_IMMOBILE' }, { status: 400 });
    const dx = Math.abs(piece.x - toX); const dy = Math.abs(piece.y - toY);
    if ((dx === 0 && dy === 0) || dx > 1 || dy > 1 || toX < 0 || toX >= BOARD_SIZE || toY < 0 || toY >= BOARD_SIZE) {
      return NextResponse.json({ error: 'ILLEGAL_MOVE' }, { status: 400 });
    }
    const { pieces: updatedPieces, events } = resolveCombatAndMove({ pieces: game.pieces as Piece[], attackerId: pieceId, toX, toY, blackHoles: game.blackHoles });
    // Compute next turn order
    const aliveTeams = Array.from(new Set(updatedPieces.filter(p=>p.alive).map(p=>p.team)));
    const canonical: Game['players'][number]['team'][] = ['A','B','C','D'];
    const order = canonical.filter(t => (aliveTeams as typeof canonical).includes(t));
    const currentTeam = game.players.find(p=>p.userId===userId)!.team;
    const idx = order.indexOf(currentTeam);
    const nextTeam = order[(idx+1)%order.length];
    const nextUser = game.players.find(p=>p.team===nextTeam)?.userId || userId;
    // Handle flag capture and game end scenarios
    const flagCapture = events.find(e => e.type === 'flag-capture') as (CombatEvent & { type: 'flag-capture'; flagTeam: string; attackerTeam: string }) | undefined;
    if (flagCapture) {
      // Determine number of active teams currently on the board (alive pieces)
      const activeTeamsCount = new Set(updatedPieces.filter(p => p.alive).map(p => p.team)).size;
      if (activeTeamsCount > 2) {
        // Multiplayer: eliminate captured team -> all their pieces removed, player becomes spectator
        const eliminatedTeam = flagCapture.flagTeam as Team;
        // Mark all eliminated team's pieces as dead
        const newPieces = updatedPieces.map(p => p.team === eliminatedTeam ? { ...p, alive: false } : p);
        // Remove eliminated player from the game roster
        const newPlayers = game.players.filter(p => p.team !== eliminatedTeam);
        // Recompute next turn based on remaining alive teams and players
        const aliveTeamsPost = Array.from(new Set(newPieces.filter(p => p.alive).map(p => p.team)));
        const canonicalTeams: Team[] = ['A','B','C','D'];
        const orderPost = canonicalTeams.filter(t => (aliveTeamsPost as Team[]).includes(t));
        const currentTeam = game.players.find(p=>p.userId===userId)!.team;
        const idxPost = orderPost.indexOf(currentTeam);
        const nextTeamPost = orderPost[(idxPost+1) % orderPost.length];
        const nextUserPost = newPlayers.find(p=>p.team===nextTeamPost)?.userId || userId;
        // If only one team remains, finish the game immediately
        const teamsLeft = Array.from(new Set(newPieces.filter(p=>p.alive).map(p=>p.team)));
        if (teamsLeft.length === 1) {
          const winnerTeam = teamsLeft[0] as Team;
          const { rated, eloResults } = await finalizeGameAndBroadcast({ game, gameId: id, updatedPieces: newPieces, winnerTeam, flagCapture: true });
          return NextResponse.json({ ok: true, correct: true, finished: true, winnerTeam, rated, eloResults });
        }
        await gamesCol.updateOne(
          { _id: id },
          { $set: { pieces: newPieces, players: newPlayers, turnOfUserId: nextUserPost, pendingQuestion: null }, $push: { questionHistory: historyEntry } }
        );
        await publishGameEvent(id, 'game.move', { pieceId, toX, toY, events, nextTurnUserId: nextUserPost, pieces: newPieces, players: newPlayers, eliminatedTeam });
        return NextResponse.json({ ok: true, correct: true });
      } else {
        // Two-player: flag capture ends the game
        const winnerTeam = flagCapture.attackerTeam as Team;
        const { rated, eloResults } = await finalizeGameAndBroadcast({ game, gameId: id, updatedPieces, winnerTeam, flagCapture: true });
        return NextResponse.json({ ok: true, correct: true, finished: true, winnerTeam, rated, eloResults });
      }
    }
    // No flag capture: check for last team standing
    const aliveTeamsFinal = Array.from(new Set(updatedPieces.filter(p => p.alive).map(p => p.team)));
    if (aliveTeamsFinal.length === 1) {
      const winnerTeam = aliveTeamsFinal[0] as Team;
      const { rated, eloResults } = await finalizeGameAndBroadcast({ game, gameId: id, updatedPieces, winnerTeam, flagCapture: false });
      return NextResponse.json({ ok: true, correct: true, finished: true, winnerTeam, rated, eloResults });
    }
    // Continue game normally
    await gamesCol.updateOne(
      { _id: id },
      { $set: { pieces: updatedPieces, turnOfUserId: nextUser, pendingQuestion: null }, $push: { questionHistory: historyEntry } }
    );
    await publishGameEvent(id, 'game.move', { pieceId, toX, toY, events, nextTurnUserId: nextUser, pieces: updatedPieces });
    return NextResponse.json({ ok: true, correct: true });
  } catch (e) {
    console.error('Attempt endpoint failed', e);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}