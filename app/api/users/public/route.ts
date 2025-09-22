import { getCollection } from '@/lib/db';
import { User } from '@/models/types';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userIds } = body || {};
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Response(JSON.stringify({ users: [] }), { status: 200 });
    }
    const col = await getCollection<User>('users');
  const ids: string[] = userIds.filter((v: unknown): v is string => typeof v === 'string');
  // Stored _id is a string in our User type; filter valid non-anon ids directly
  const realIds = ids.filter(id => id && !id.startsWith('anon-'));
  if (realIds.length === 0) {
    return new Response(JSON.stringify({ users: [] }), { status: 200 });
  }
  type Doc = { _id: string; email: string; elo: number; name?: string };
  const docs = await col
    .find({ _id: { $in: realIds } }, { projection: { email: 1, elo: 1, name: 1 } })
    .toArray() as Doc[];
  const users = docs.map(d => ({ id: d._id, email: d.email, elo: d.elo, name: d.name || d.email.split('@')[0] }));
    return new Response(JSON.stringify({ users }), { status: 200 });
  } catch (e) {
    console.error('users/public error', e);
    return new Response(JSON.stringify({ users: [] }), { status: 200 });
  }
}
