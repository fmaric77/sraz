import { CATEGORIES, Piece, Team, Game, Pos } from '@/models/types';

// Global board dimension (was 8, now 7 for a 7x7 board)
export const BOARD_SIZE = 7;

// Cross-runtime UUID-ish generator (prefers crypto.randomUUID if available)
function generateId(): string {
  // Access global crypto in a runtime-agnostic way without suppressing TS.
  const g: typeof globalThis | undefined = typeof globalThis !== 'undefined' ? globalThis : undefined;
  const cryptoObj: typeof globalThis.crypto | undefined = g?.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const arr = new Uint8Array(16);
    cryptoObj.getRandomValues(arr);
    arr[6] = (arr[6] & 0x0f) | 0x40;
    arr[8] = (arr[8] & 0x3f) | 0x80;
    const hex: string[] = [];
    for (let i = 0; i < arr.length; i++) hex.push((arr[i] + 0x100).toString(16).slice(1));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }
  return 'xxxxxxxxyxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateBoardCategories(): string[][] {
  // Distribute categories as evenly as possible over BOARD_SIZE^2 squares
  const total = BOARD_SIZE * BOARD_SIZE; // 49 for 7x7
  const n = CATEGORIES.length; // now 9
  const base = Math.floor(total / n);
  let remainder = total - base * n; // 1 leftover
  const pool: string[] = [];
  for (const c of CATEGORIES) {
    const count = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    for (let i = 0; i < count; i++) pool.push(c);
  }
  shuffle(pool);
  const board: string[][] = [];
  let idx = 0;
  for (let y = 0; y < BOARD_SIZE; y++) {
    board[y] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      board[y][x] = pool[idx++];
    }
  }
  return board;
}

export function generateInitialPieces(playerCount: number, teams?: Team[]): Piece[] {
  // Each team: 5 pawns (level 1) + 1 flag (special) positioned in its farthest corner square.
  const max = BOARD_SIZE - 1;
  const flagSquares: Record<Team, Pos> = {
    A: { x: 0, y: 0 },
    B: { x: max, y: max },
    C: { x: max, y: 0 },
    D: { x: 0, y: max },
  };
  // Candidate pawn placement patterns around each corner (excluding the flag square)
  const pawnPatterns: Record<Team, Pos[]> = {
    A: [ { x:1,y:0 }, { x:0,y:1 }, { x:1,y:1 }, { x:2,y:0 }, { x:0,y:2 } ],
    B: [ { x:max-1,y:max }, { x:max,y:max-1 }, { x:max-1,y:max-1 }, { x:max-2,y:max }, { x:max,y:max-2 } ],
    C: [ { x:max-1,y:0 }, { x:max,y:1 }, { x:max-1,y:1 }, { x:max-2,y:0 }, { x:max,y:2 } ],
    D: [ { x:1,y:max }, { x:0,y:max-1 }, { x:1,y:max-1 }, { x:2,y:max }, { x:0,y:max-2 } ],
  };
  const order: Team[] = teams && teams.length ? teams : ['A','B','C','D'];
  // If explicit teams provided, override playerCount to the number of teams actually given
  const effectiveCount = teams && teams.length ? teams.length : playerCount;
  const pieces: Piece[] = [];
  for (let i = 0; i < Math.min(effectiveCount, order.length); i++) {
    const team = order[i];
    // Flag
    const f = flagSquares[team];
    pieces.push({ id: generateId(), team, level: 1, x: f.x, y: f.y, alive: true, isFlag: true });
    // Pawns
    for (const p of pawnPatterns[team]) {
      pieces.push({ id: generateId(), team, level: 1, x: p.x, y: p.y, alive: true });
    }
  }
  return pieces;
}

export function isNeighbor(from: Pos, to: Pos): boolean {
  if (to.x < 0 || to.x >= BOARD_SIZE || to.y < 0 || to.y >= BOARD_SIZE) return false;
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  if (dx === 0 && dy === 0) return false;
  return dx <= 1 && dy <= 1;
}

interface CreateGameParams {
  creatorUserId: string;
  secondUserId?: string; // legacy lobby param
  playerCount?: number; // for local multi-player (2..4)
  local?: boolean; // mark as local/offline game
  explicitPlayers?: { userId: string; team: Team }[]; // when creating from lobby preserve real users
}

export function createNewGame(params: CreateGameParams): Game {
  if (params.explicitPlayers && params.explicitPlayers.length) {
    const playerCount = Math.min(4, Math.max(1, params.explicitPlayers.length));
    const boardCategories = generateBoardCategories();
  const pieces = generateInitialPieces(playerCount, params.explicitPlayers.map(p=>p.team));
    // Generate two distinct black hole squares not occupied by initial pieces
    const occupied = new Set(pieces.map(p => `${p.x},${p.y}`));
    // Allow black holes only within the 3x3 center block (nine central squares)
    const center = Math.floor(BOARD_SIZE / 2);
    function isAllowedBlackHoleSquare(x:number,y:number){
      return Math.abs(x - center) <= 1 && Math.abs(y - center) <= 1;
    }
  function randomSquare(): {x:number;y:number} { return { x: Math.floor(Math.random()*BOARD_SIZE), y: Math.floor(Math.random()*BOARD_SIZE) }; }
    const blackHoles: {x:number;y:number}[] = [];
    while (blackHoles.length < 2) {
      const candidate = randomSquare();
      const key = `${candidate.x},${candidate.y}`;
      if (occupied.has(key)) continue;
      if (!isAllowedBlackHoleSquare(candidate.x, candidate.y)) continue;
      if (blackHoles.some(b => b.x === candidate.x && b.y === candidate.y)) continue;
      blackHoles.push(candidate);
    }
    const players = params.explicitPlayers;
    return {
      players,
      boardCategories,
      pieces,
      turnOfUserId: players[0].userId,
      status: 'running',
      createdAt: new Date(),
      questionHistory: [],
      blackHoles,
    };
  }
  const playerCount = params.playerCount && params.playerCount >= 2 && params.playerCount <= 4 ? params.playerCount : (params.secondUserId ? 2 : 1);
  const boardCategories = generateBoardCategories();
  const pieces = generateInitialPieces(playerCount);
  // Generate two distinct black hole squares not occupied by initial pieces
  const occupied = new Set(pieces.map(p => `${p.x},${p.y}`));
  // Allow black holes only within the 3x3 center block (nine central squares)
  const center = Math.floor(BOARD_SIZE / 2);
  function isAllowedBlackHoleSquare(x:number,y:number){
    return Math.abs(x - center) <= 1 && Math.abs(y - center) <= 1;
  }
  function randomSquare(): {x:number;y:number} { return { x: Math.floor(Math.random()*BOARD_SIZE), y: Math.floor(Math.random()*BOARD_SIZE) }; }
  const blackHoles: {x:number;y:number}[] = [];
  while (blackHoles.length < 2) {
    const candidate = randomSquare();
    const key = `${candidate.x},${candidate.y}`;
    if (occupied.has(key)) continue; // don't place under an initial piece
    if (!isAllowedBlackHoleSquare(candidate.x, candidate.y)) continue; // restrict to 3x3 center block
    if (blackHoles.some(b => b.x === candidate.x && b.y === candidate.y)) continue;
    blackHoles.push(candidate);
  }
  const players: { userId: string; team: Team }[] = [];
  const teamOrder: Team[] = ['A','B','C','D'];
  for (let i = 0; i < playerCount; i++) {
    const t = teamOrder[i];
    const uid = i === 0 ? params.creatorUserId : (params.local ? `local-player-${i+1}` : (i === 1 && params.secondUserId) ? params.secondUserId : `pending-player-${i+1}`);
    players.push({ userId: uid, team: t });
  }
  const game: Game = {
    players,
    boardCategories,
    pieces,
  turnOfUserId: players[0].userId,
  status: params.local ? 'running' : 'waiting',
    createdAt: new Date(),
    questionHistory: [],
    blackHoles,
  };
  return game;
}

// Convenience helper for client to create a fully local multiplayer game (2-4 players)
export function createLocalGame(playerCount: number): Game {
  return createNewGame({ creatorUserId: 'local-player-1', playerCount, local: true });
}

export function pieceAt(pieces: Piece[], x: number, y: number): Piece | undefined {
  return pieces.find(p => p.alive && p.x === x && p.y === y);
}

export function canMovePiece(pieces: Piece[], pieceId: string, to: Pos): boolean {
  const piece = pieces.find(p => p.id === pieceId && p.alive);
  if (!piece) return false;
  return isNeighbor({ x: piece.x, y: piece.y }, to);
}

// Chess-like coordinate helpers (files: a.., ranks: 1..). Note: (0,0) -> a1
export function posToCode(x: number, y: number): string {
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return '';
  const file = String.fromCharCode('a'.charCodeAt(0) + x);
  const rank = (y + 1).toString();
  return `${file}${rank}`;
}

export function codeToPos(code: string): Pos | null {
  if (!code) return null;
  const c = code.trim().toLowerCase();
  // support formats like "a1" or "g7" within BOARD_SIZE
  const match = /^([a-z])(\d+)$/.exec(c);
  if (!match) return null;
  const fileChar = match[1];
  const rankNum = parseInt(match[2], 10);
  const x = fileChar.charCodeAt(0) - 'a'.charCodeAt(0);
  const y = rankNum - 1;
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null;
  return { x, y };
}
