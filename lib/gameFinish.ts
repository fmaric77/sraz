import { getCollection } from '@/lib/db';
import { Game, GameResult, User } from '@/models/types';
import { updateEloMulti } from '@/lib/elo';
import { updateUserEloAndRecord } from '@/lib/users';
import { publishGameEvent } from '@/lib/realtime';

interface FinishParams {
  game: Game;
  gameId: string;
  updatedPieces: Game['pieces'];
  winnerTeam: string | null;
  flagCapture: boolean;
  extraHistoryEntry?: { turn: number; questionId: string; correct: boolean; category: string; userId?: string };
}

export async function finalizeGameAndBroadcast({ game, gameId, updatedPieces, winnerTeam, flagCapture, extraHistoryEntry }: FinishParams) {
  const gamesCol = await getCollection<Game>('games');
  const allPlayerIds = game.players.map(p=>p.userId);
  const usersCol = await getCollection<User>('users');
  const userDocs = await usersCol.find({ _id: { $in: allPlayerIds } }).toArray();
  const rated = userDocs.length === allPlayerIds.length;
  let eloResults: { userId: string; preElo: number; postElo: number; delta: number; result: 'win' | 'loss' | 'draw' | 'other'; team: string }[] = [];
  if (rated) {
    const playerStates = userDocs.map(d => ({ userId: d._id!, preElo: d.elo, score: game.players.find(p=>p.userId===d._id)?.team === winnerTeam ? 1 : 0 }));
    const updated = updateEloMulti(playerStates);
    eloResults = updated.map(r => ({ userId: r.userId, preElo: r.preElo, postElo: r.postElo, delta: r.delta, result: r.score === 1 ? 'win' : 'loss', team: game.players.find(p=>p.userId===r.userId)!.team }));
    for (const r of eloResults) {
      await updateUserEloAndRecord(r.userId, r.postElo, { win: r.result==='win', loss: r.result==='loss' });
    }
  }
  const resultsCol = await getCollection<GameResult>('gameResults');
  await resultsCol.insertOne({
    gameId: gameId,
    finishedAt: new Date(),
    players: (rated ? eloResults : game.players.map(p=> ({ userId: p.userId, team: p.team, preElo: 0, postElo: 0, result: p.team === winnerTeam ? 'win' : 'other' }))) as unknown as GameResult['players'],
    winnerUserId: game.players.find(p=> p.team === winnerTeam!)?.userId,
    rated
  });
  // Append extra history entry if provided (so final question attempt is not lost on immediate finishes)
  if (extraHistoryEntry) {
    await gamesCol.updateOne({ _id: gameId }, { $set: { pieces: updatedPieces, status: 'finished', pendingQuestion: null }, $push: { questionHistory: extraHistoryEntry } });
  } else {
    await gamesCol.updateOne({ _id: gameId }, { $set: { pieces: updatedPieces, status: 'finished', pendingQuestion: null } });
  }
  // Compose stats (per-player accuracy) from existing history plus potential extra entry
  const historySource = [...game.questionHistory];
  if (extraHistoryEntry) historySource.push(extraHistoryEntry);
  const perMap: Record<string, { attempts: number; correct: number; team: string }> = {};
  historySource.forEach(h => {
    if (!h.userId) return;
    if (!perMap[h.userId]) {
      const team = game.players.find(p=>p.userId===h.userId)?.team || '?';
      perMap[h.userId] = { attempts: 0, correct: 0, team };
    }
    perMap[h.userId].attempts += 1;
    if (h.correct) perMap[h.userId].correct += 1;
  });
  const stats = Object.entries(perMap).map(([userId, v]) => {
    const doc = userDocs.find(d=> d._id === userId);
    return { userId, team: v.team, attempts: v.attempts, correct: v.correct, accuracy: v.attempts ? v.correct / v.attempts : 0, name: doc?.name };
  });
  await publishGameEvent(gameId, 'game.finished', { winnerTeam, pieces: updatedPieces, rated, eloResults, flagCapture, stats });
  return { rated, eloResults };
}