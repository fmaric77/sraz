// Elo rating helper supporting 2-4 player free-for-all.
// For N>2 we approximate expected score for each player as the
// average of pairwise expectations vs every other player.
// Score inputs: 1 = win, 0 = loss, 0.5 = draw (future use).

export interface EloPlayerState {
  userId: string;
  preElo: number;
  // final score in range [0,1]; in multi-winner scenarios
  // distribute 1 equally among winners (e.g., 3-way tie for first => each 1/3)
  score: number; 
}

export interface EloResult extends EloPlayerState {
  postElo: number;
  delta: number;
}

// K factor tuning: can vary by volatility or player games played in future.
const DEFAULT_K = 32;

// Standard logistic expected score for player A vs B.
function expected(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

// Compute pairwise expectation matrix and derive each player's aggregate expectation.
function multiPlayerExpectations(players: EloPlayerState[]): number[] {
  const n = players.length;
  const expectations: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      expectations[i] += expected(players[i].preElo, players[j].preElo);
    }
    // average of pairwise expectations
    expectations[i] /= (n - 1);
  }
  return expectations;
}

// Main update function. Accepts player states with final scores.
// Returns list with postElo and delta.
export function updateEloMulti(players: EloPlayerState[], opts?: { kFactor?: number }): EloResult[] {
  const k = opts?.kFactor ?? DEFAULT_K;
  if (players.length < 2) throw new Error('Need at least two players for Elo update');
  if (players.some(p => p.preElo <= 0)) throw new Error('Invalid preElo');
  const expectations = multiPlayerExpectations(players);
  return players.map((p, idx) => {
    const exp = expectations[idx];
    const delta = Math.round(k * (p.score - exp));
    const postElo = p.preElo + delta;
    return { ...p, postElo, delta };
  });
}

// Convenience for standard 2-player outcome (win/loss or draw)
export function updateEloHeadToHead(aElo: number, bElo: number, result: 'A' | 'B' | 'draw', kFactor = DEFAULT_K) {
  const expA = expected(aElo, bElo);
  const expB = 1 - expA;
  const scoreA = result === 'A' ? 1 : result === 'draw' ? 0.5 : 0;
  const scoreB = result === 'B' ? 1 : result === 'draw' ? 0.5 : 0;
  const deltaA = Math.round(kFactor * (scoreA - expA));
  const deltaB = Math.round(kFactor * (scoreB - expB));
  return {
    a: { pre: aElo, post: aElo + deltaA, delta: deltaA },
    b: { pre: bElo, post: bElo + deltaB, delta: deltaB },
  };
}

// Helper to derive score allocations for free-for-all given ordered finish list.
// If winners array contains 1 id => winner score 1, others 0.
// If multiple winners (tie), each gets 1/numWinners.
export function buildScoresForWinners(orderOrWinners: string[], _totalPlayers: number): Record<string, number> {
  if (orderOrWinners.length === 0) throw new Error('No winners provided');
  const scores: Record<string, number> = {};
  const portion = 1 / orderOrWinners.length;
  for (const w of orderOrWinners) scores[w] = portion;
  // others default to 0; caller will map
  return scores;
}

// High-level pipeline: given list of players with elo and array of winner userIds (1..N tie) produce EloResult[]
export function computeResultsFromWinnerSet(players: { userId: string; elo: number }[], winnerUserIds: string[], kFactor?: number): EloResult[] {
  const scoreMap = buildScoresForWinners(winnerUserIds, players.length);
  const base: EloPlayerState[] = players.map(p => ({ userId: p.userId, preElo: p.elo, score: scoreMap[p.userId] ?? 0 }));
  return updateEloMulti(base, { kFactor });
}
