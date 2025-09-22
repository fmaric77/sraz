import { createUser } from '@/lib/users';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body || {};
    if (!email || !password || password.length < 6) {
      return new Response(JSON.stringify({ error: 'INVALID_INPUT' }), { status: 400 });
    }
    const user = await createUser(email, password);
    return new Response(JSON.stringify({ id: user._id, email: user.email }), { status: 201 });
  } catch (e) {
    const err = e as Error;
    if (err?.message === 'EMAIL_EXISTS') {
      return new Response(JSON.stringify({ error: 'EMAIL_EXISTS' }), { status: 409 });
    }
    console.error('Register error', err);
    return new Response(JSON.stringify({ error: 'SERVER_ERROR' }), { status: 500 });
  }
}
