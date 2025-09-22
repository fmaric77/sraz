import { MongoClient, Db, Collection, Document } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/quizchess';
const dbName = process.env.MONGODB_DB || (() => {
  // Try to parse last path segment from URI if present
  try {
    const afterSlash = uri.split('/').pop();
    if (afterSlash && afterSlash.length > 0) return afterSlash.split('?')[0];
  } catch {}
  return 'quizchess';
})();

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

async function getClient(): Promise<MongoClient> {
  if (client) return client; // MongoClient reused; driver manages pooling
  if (!clientPromise) {
    clientPromise = MongoClient.connect(uri).then(c => {
      client = c;
      return c;
    });
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const c = await getClient();
  return c.db(dbName);
}

export async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export async function closeDb() {
  if (client) await client.close();
  client = null;
  clientPromise = null;
}
