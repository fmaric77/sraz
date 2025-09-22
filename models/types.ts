// Core domain types for Knowledge-Quiz Chess-like Game
// These mirror the spec in README and are used both server and client side.

export type Team = 'A' | 'B' | 'C' | 'D';

export type PieceLevel = 1 | 2 | 3; // 1 Pawn, 2 Knight, 3 Cavalry

export interface Pos { x: number; y: number }
export interface Vector { x: number; y: number }

export interface Piece {
  id: string;
  team: Team;
  level: PieceLevel;
  x: number;
  y: number;
  alive: boolean;
}

export interface GamePlayerRef {
  userId: string;
  team: Team;
}

export interface GameQuestionHistoryEntry {
  turn: number;
  questionId: string;
  correct: boolean;
}

export interface Game {
  _id?: string;
  players: GamePlayerRef[];
  boardCategories: string[][]; // 8x8
  pieces: Piece[];
  turnOfUserId: string; // whose turn
  status: 'waiting' | 'running' | 'finished';
  createdAt: Date;
  questionHistory: GameQuestionHistoryEntry[];
  blackHoles?: { x: number; y: number }[]; // special lethal squares (pushed pieces die)
}

export interface LobbyPlayerRef {
  userId: string; // anonymous or authenticated id
  team: Team; // A-D
  joinedAt: Date;
}

export interface Lobby {
  _id?: string;
  lobbyCode: string; // short invite code / id
  hostUserId: string;
  maxPlayers: number; // 2..4
  players: LobbyPlayerRef[]; // order matters (team assignment)
  status: 'open' | 'starting' | 'started' | 'closed';
  createdAt: Date;
  gameId?: string; // set once game created
}

export interface Question {
  _id?: string;
  category: string;
  text: string;
  choices: [string, string, string, string];
  correctIndex: number; // 0..3
  language: string; // ISO code
  metadata?: Record<string, unknown>;
}

export const CATEGORIES = [
  'Literature',
  'Culture',
  'General Knowledge',
  'History',
  'Nature',
  'Sport',
  'Geography',
  'Science',
  'Random',
] as const;
export type Category = typeof CATEGORIES[number];

export function assertPos(p: Pos) {
  if (p.x < 0 || p.x > 7 || p.y < 0 || p.y > 7) throw new Error('Position out of bounds');
}

// --- Auth & User Profile ---
export interface User {
  _id?: string; // stored as string ObjectId
  email: string;
  passwordHash: string; // bcrypt hash
  createdAt: Date;
  elo: number; // rating (default 1200)
  wins: number;
  losses: number;
  draws: number; // reserved
  name?: string; // display name
}

// Stored game result summary for completed games (primarily 2-player rated matches)
export interface GameResult {
  _id?: string;
  gameId: string;
  finishedAt: Date;
  players: {
    userId: string;
    team: Team;
    preElo: number;
    postElo: number;
    result: 'win' | 'loss' | 'draw' | 'other';
  }[];
  winnerUserId?: string; // omitted for draws / multi-team
  rated: boolean;
}
