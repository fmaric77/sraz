import { auth } from '@/auth';
import { findUserByEmail } from '@/lib/users';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ user: null }), { status: 200 });
  }
  const user = await findUserByEmail(session.user.email);
  if (!user) return new Response(JSON.stringify({ user: null }), { status: 200 });
  return new Response(JSON.stringify({ user: {
    id: user._id,
    email: user.email,
    name: user.name,
    elo: user.elo,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
  }}), { status: 200 });
}
