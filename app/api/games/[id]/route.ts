import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Game } from '@/models/types';
import { auth } from '@/auth';

// In newer Next.js versions, context.params may be a Promise and must be awaited.
// GET /api/games/:id -> returns full game (includes questionHistory & pendingQuestion)
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> } ) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
    const gamesCol = await getCollection<Game>('games');
    const game = await gamesCol.findOne({ _id: id });
    if (!game) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    // Enforce access: if accessTokens exist, require either matching token or authenticated user in players
    if (game.accessTokens && game.accessTokens.length > 0) {
      const url = new URL(req.url);
      const providedToken = url.searchParams.get('accessToken');
      let sessionUserId: string | undefined;
      try {
        const session = await auth();
        // session may be extended to include userId via auth callback
        sessionUserId = (session as { userId?: string } | null)?.userId;
      } catch {/* ignore auth errors for public access */}
      const isPlayer = sessionUserId ? game.players.some(p => p.userId === sessionUserId) : false;
      const tokenValid = providedToken ? game.accessTokens.some(t => t.token === providedToken) : false;
      if (!isPlayer && !tokenValid) {
        return NextResponse.json({ error: 'FORBIDDEN', message: 'Access token or player membership required.' }, { status: 403 });
      }
    }
    return NextResponse.json({ game });
  } catch (e) {
    console.error('GET game failed', e);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}
