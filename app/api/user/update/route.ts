import { auth } from '@/auth';
import { updateUserName, updateUserLanguage, findUserByEmail } from '@/lib/users';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const user = await findUserByEmail(session.user.email);
  if (!user?._id) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 });

  const name = (body.name ?? '').trim();
  const language = (body.language ?? '').trim();

  // Handle name update
  if (name && (name.length < 2 || name.length > 24)) {
    return new Response(JSON.stringify({ error: 'INVALID_NAME' }), { status: 400 });
  }
  if (name && !/^[A-Za-z0-9_\- ]+$/.test(name)) {
    return new Response(JSON.stringify({ error: 'INVALID_CHARS' }), { status: 400 });
  }
  if (name) {
    await updateUserName(user._id, name);
  }

  // Handle language update
  if (language) {
    // Basic validation for language code (2-5 characters, letters and dashes)
    if (!/^[a-z]{2,5}(-[A-Z]{2})?$/.test(language)) {
      return new Response(JSON.stringify({ error: 'INVALID_LANGUAGE' }), { status: 400 });
    }
    await updateUserLanguage(user._id, language);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
