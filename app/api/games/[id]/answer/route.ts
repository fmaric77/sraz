import { NextResponse } from 'next/server';

// Deprecated endpoint: instruct clients to use /attempt instead.
export async function POST() {
  console.warn('/api/games/:id/answer is deprecated. Use /attempt.');
  return NextResponse.json({ error: 'DEPRECATED', message: 'Use /api/games/:id/attempt instead.' }, { status: 410 });
}
