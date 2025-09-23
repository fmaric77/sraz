import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Game } from '@/models/types';

// Simple in-memory rate limiter (per game+user). Accepts at most 5 pending creations per 30s.
// NOTE: In a multi-instance deployment this should be moved to a shared store (Redis) for correctness.
const pendingRate: Record<string, { ts: number }[]> = {};
const PENDING_WINDOW_MS = 30_000;
const PENDING_MAX = 5;

// POST /api/games/:id/pending { userId, pieceId, toX, toY, category, questionId }
// Stores a pending question challenge so only that exact attempt can proceed.
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const idIndex = segments.indexOf('games') + 1;
    const id = segments[idIndex];
    if (!id) return NextResponse.json({ error: 'BAD_PATH' }, { status: 400 });
    const body = await req.json();
  const { userId, pieceId, toX, toY, category, questionId } = body || {};
    if (!userId || !pieceId || typeof toX !== 'number' || typeof toY !== 'number' || !category || !questionId) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }
  const gamesCol = await getCollection<Game>('games');
    const game = await gamesCol.findOne({ _id: id });
    if (!game) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (game.turnOfUserId !== userId) return NextResponse.json({ error: 'NOT_YOUR_TURN' }, { status: 409 });
    if (game.pendingQuestion) {
      // Allow override only if expired
      const createdAt = game.pendingQuestion.requestedAt ? new Date(game.pendingQuestion.requestedAt).getTime() : 0;
      if (createdAt && Date.now() - createdAt > 45_000) {
        // continue and replace
      } else {
        return NextResponse.json({ error: 'ALREADY_PENDING' }, { status: 409 });
      }
    }
    // Category integrity: allow any pick if square is Random, otherwise enforce match
    const boardCat = game.boardCategories[toY]?.[toX];
    if (!boardCat) return NextResponse.json({ error: 'BAD_TARGET' }, { status: 400 });
    // If square is Random, override storedCategory to 'Random' to be resolved later
    const storedCategory = boardCat === 'Random' ? 'Random' : category;
    if (boardCat !== 'Random' && storedCategory !== boardCat) {
      return NextResponse.json({ error: 'CATEGORY_MISMATCH' }, { status: 409 });
    }
    // Rate limit check
    const key = `${id}:${userId}`;
    const now = Date.now();
    const arr = (pendingRate[key] = (pendingRate[key] || []).filter(e => now - e.ts < PENDING_WINDOW_MS));
    if (arr.length >= PENDING_MAX) {
      return NextResponse.json({ error: 'RATE_LIMIT', retryAfterMs: PENDING_WINDOW_MS - (now - arr[0].ts) }, { status: 429 });
    }
    arr.push({ ts: now });
  // Store questionId as string
    // Store the effective pending category (persist 'Random' for wildcard squares)
    await gamesCol.updateOne(
      { _id: id },
      { $set: { pendingQuestion: { questionId, pieceId, toX, toY, category: storedCategory, requestedAt: new Date() } } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Set pending failed', e);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}