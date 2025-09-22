import { auth } from '@/auth';
import { updateUserName, findUserByEmail } from '@/lib/users';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? '').trim();
  if (!name || name.length < 2 || name.length > 24) {
    return new Response(JSON.stringify({ error: 'INVALID_NAME' }), { status: 400 });
  }
  // Basic allowed chars (letters, numbers, underscore, dash, space)
  if (!/^[A-Za-z0-9_\- ]+$/.test(name)) {
    return new Response(JSON.stringify({ error: 'INVALID_CHARS' }), { status: 400 });
  }
  const user = await findUserByEmail(session.user.email);
  if (!user?._id) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 });
  await updateUserName(user._id, name);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
