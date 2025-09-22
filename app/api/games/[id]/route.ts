import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Game } from '@/models/types';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean); // ['api','games',':id']
  const idIndex = segments.indexOf('games') + 1;
  const id = segments[idIndex];
  if (!id) {
    return NextResponse.json({ error: 'BAD_PATH' }, { status: 400 });
  }
  const gamesCol = await getCollection<Game>('games');
  const game = await gamesCol.findOne({ _id: id });
  if (!game) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ game });
}
