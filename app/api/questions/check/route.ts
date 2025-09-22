import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Question } from '@/models/types';
import type { ObjectId } from 'mongodb';

interface DbQuestion extends Omit<Question, '_id'> { _id: string | ObjectId }

// POST /api/questions/check  { questionId, answerIndex }
// Returns { correct: boolean }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questionId, answerIndex } = body || {};
    if (!questionId || typeof answerIndex !== 'number') {
      return NextResponse.json({ error: 'questionId and answerIndex required' }, { status: 400 });
    }
    const col = await getCollection<DbQuestion>('questions');
    let lookupId: string | ObjectId = questionId;
    if (typeof questionId === 'string') {
      const { ObjectId } = await import('mongodb');
      if (ObjectId.isValid(questionId)) lookupId = new ObjectId(questionId);
    }
    const doc = await col.findOne({ _id: lookupId });
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const correct = doc.correctIndex === answerIndex;
    return NextResponse.json({ correct });
  } catch (e) {
    console.error('Answer check failed', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
