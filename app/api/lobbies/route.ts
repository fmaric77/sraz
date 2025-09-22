import { NextRequest, NextResponse } from 'next/server';
import { createLobby } from '@/lib/lobby';
import { auth } from '@/auth';

interface ExtendedSession {
  user?: { name?: string | null; email?: string | null };
  userId?: string; // added in auth callbacks
  elo?: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // Prefer explicit body hostUserId, else authenticated session user, else generate anonymous id
  let hostUserId: string | undefined = body.hostUserId;
  if (!hostUserId) {
    try {
      const session = (await auth()) as ExtendedSession | null;
      if (session?.userId) hostUserId = session.userId;
    } catch {}
  }
  if (!hostUserId) hostUserId = 'anon-' + Math.random().toString(36).slice(2,8);
  const maxPlayers = body.maxPlayers || 2;
  const lobby = await createLobby(hostUserId, maxPlayers);
  return NextResponse.json({ lobby });
}
