import { NextRequest, NextResponse } from 'next/server';
import { createLobby } from '@/lib/lobby';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const hostUserId = body.hostUserId || 'anon-' + Math.random().toString(36).slice(2,8);
  const maxPlayers = body.maxPlayers || 2;
  const lobby = await createLobby(hostUserId, maxPlayers);
  return NextResponse.json({ lobby });
}
