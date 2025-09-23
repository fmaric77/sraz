import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Game } from '@/models/types';

// In newer Next.js versions, context.params may be a Promise and must be awaited.
// GET /api/games/:id -> returns full game (includes questionHistory & pendingQuestion)
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> } ) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
    const gamesCol = await getCollection<Game>('games');
    const game = await gamesCol.findOne({ _id: id });
    if (!game) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ game });
  } catch (e) {
    console.error('GET game failed', e);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}
