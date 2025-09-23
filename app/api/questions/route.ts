import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Question } from '@/models/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });
  const col = await getCollection<Question>('questions');
  const docs = await col.aggregate([
    { $match: { category } },
    { $sample: { size: 1 } },
  ]).toArray();
  if (!docs.length) return NextResponse.json({ error: 'no questions' }, { status: 404 });
  const q = docs[0];
  // Hide correctIndex from client; provide separate validation endpoint (future)
  // Strip out correctIndex and serialize _id to string
  const { correctIndex: _unusedCorrectIndex, _id, ...rest } = q as Question;
  const question = {
    _id: _id?.toString(),
    ...rest,
  };
  return NextResponse.json({ question });
}
