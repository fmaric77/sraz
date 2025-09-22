import { getCollection } from '@/lib/db';
import { User } from '@/models/types';
import bcrypt from 'bcryptjs';

export async function findUserByEmail(email: string): Promise<User | null> {
  const col = await getCollection<User>('users');
  return col.findOne({ email: email.toLowerCase() });
}

export async function createUser(email: string, password: string): Promise<User> {
  const col = await getCollection<User>('users');
  const existing = await col.findOne({ email: email.toLowerCase() });
  if (existing) throw new Error('EMAIL_EXISTS');
  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = {
    email: email.toLowerCase(),
    passwordHash,
    createdAt: new Date(),
    elo: 1200,
    wins: 0,
    losses: 0,
    draws: 0,
    name: email.split('@')[0],
  };
  const result = await col.insertOne(user as Omit<User, '_id'>);
  user._id = result.insertedId.toString();
  return user;
}

export async function validateUser(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function updateUserEloAndRecord(userId: string, elo: number, delta: { win?: boolean; loss?: boolean; draw?: boolean }) {
  const col = await getCollection<User>('users');
  const inc: Partial<Record<'wins' | 'losses' | 'draws', number>> = {};
  if (delta.win) inc.wins = 1; else if (delta.loss) inc.losses = 1; else if (delta.draw) inc.draws = 1;
  await col.updateOne({ _id: userId }, { $set: { elo }, $inc: inc });
}

export async function updateUserName(userId: string, name: string) {
  const col = await getCollection<User>('users');
  await col.updateOne({ _id: userId }, { $set: { name } });
}
