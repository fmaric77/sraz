import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { validateUser, findUserByEmail } from './lib/users';

export const { auth, signIn, signOut, handlers } = NextAuth({
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
  authorize: async (creds) => {
        const email = (creds as any)?.email as string | undefined;
        const password = (creds as any)?.password as string | undefined;
        if (!email || !password) return null;
        const user = await validateUser(email, password);
  if (!user) return null;
  // Convert ObjectId to string for consistent ID handling
  return { id: user._id!.toString(), email: user.email, elo: user.elo, name: user.name } as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.elo = (user as any).elo;
        token.name = (user as any).name;
      } else if (token.email) {
        // refresh elo from DB periodically (optional)
        try {
          const u = await findUserByEmail(token.email as string);
          if (u) { token.elo = u.elo; token.name = u.name; }
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).userId = token.userId;
      (session.user as any).elo = token.elo;
      if (token.name) (session.user as any).name = token.name;
      return session;
    }
  }
});
