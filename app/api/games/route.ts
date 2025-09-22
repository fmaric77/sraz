import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { createNewGame } from '@/lib/board';
import { Game } from '@/models/types';
import { randomUUID } from 'crypto';

// GET /api/games - list waiting games (public placeholder criterion)
export async function GET() {
  const gamesCol = await getCollection<Game>('games');
  const games = await gamesCol.find({ status: { $in: ['waiting', 'running'] } }, { projection: { boardCategories: 0, pieces: 0, questionHistory: 0 } }).limit(20).toArray();
  return NextResponse.json({ games });
}

// POST /api/games - create a new game (for now accepts JSON { creatorUserId, opponentUserId? })
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const creatorUserId: string | undefined = body.creatorUserId;
  if (!creatorUserId) {
    return NextResponse.json({ error: 'creatorUserId required' }, { status: 400 });
  }
  const game = createNewGame({ creatorUserId, secondUserId: body.opponentUserId });
  (game as Game & { _id: string })._id = randomUUID();
  try {
    const gamesCol = await getCollection<Game>('games');
  await gamesCol.insertOne(game as unknown as Game);
  return NextResponse.json({ game, persisted: true });
  } catch (e) {
    console.error('DB insert failed, returning ephemeral game', e);
  return NextResponse.json({ game, persisted: false, warning: 'Database unavailable; game not persisted.' }, { status: 200 });
  }
}

// NOTE: single game fetch route moved to /api/games/[id] for Next.js route colocation.
