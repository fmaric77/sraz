import { auth } from '@/auth';
import { findUserByEmail, setSelectedBoardSkin } from '@/lib/users';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
  const user = await findUserByEmail(session.user.email);
  if (!user?._id) return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
  const body = await req.json().catch(()=>({}));
  const skinId = String(body.skinId || '');
  if (!skinId) return new Response(JSON.stringify({ error: 'INVALID' }), { status: 400 });
  const owned = new Set(user.purchasedSkins || []);
  if (!owned.has(skinId)) return new Response(JSON.stringify({ error: 'NOT_OWNED' }), { status: 400 });
  await setSelectedBoardSkin(user._id, skinId);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}