import { NextResponse } from 'next/server';
import Ably from 'ably';

export async function GET(req: Request): Promise<NextResponse> {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'NOT_CONFIGURED', message: 'ABLY_API_KEY missing on server.' }, { status: 500 });
  }
  try {
    const url = new URL(req.url);
    const provided = url.searchParams.get('userId');
    const safe = provided && /^[a-zA-Z0-9_\-:.]{3,64}$/.test(provided) ? provided : ('anon-' + Math.random().toString(36).slice(2,8));
    const clientId = safe;
    const rest = new Ably.Rest(apiKey);
    const tokenRequest = await rest.auth.createTokenRequest({ clientId });
    return NextResponse.json(tokenRequest);
  } catch (e: unknown) {
    const msg = typeof e === 'object' && e && 'message' in e ? (e as { message?: string }).message : 'Unknown error';
    console.error('[realtime/token] Failed to create token request:', msg);
    return NextResponse.json({ error: 'TOKEN_REQUEST_FAILED', message: msg }, { status: 500 });
  }
}
