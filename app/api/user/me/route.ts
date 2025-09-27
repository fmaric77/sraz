import { auth } from '@/auth';
import { findUserByEmail } from '@/lib/users';

export async function GET() {
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
    language: user.language,
    elo: user.elo,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    purchasedSkins: user.purchasedSkins || [],
    selectedBoardSkin: user.selectedBoardSkin || null,
  }}), { status: 200 });
}
