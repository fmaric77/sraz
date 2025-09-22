// Lightweight in-memory cache for public user lookups (client-side only)
// Provides batching & TTL invalidation.
// Usage (client components only):
//   import { fetchPublicUsers } from '@/lib/userPublicCache';
//   const users = await fetchPublicUsers(userIds);
// Returned shape: Record<userId, { email: string; elo: number; name?: string }>

interface PublicUserInfo { email: string; elo: number; name?: string }
interface CacheEntry { value: PublicUserInfo; expires: number }

const CACHE: Map<string, CacheEntry> = new Map();

// 2 minutes TTL (tweakable)
const TTL = 2 * 60 * 1000;

function now() { return Date.now(); }

function isFresh(entry: CacheEntry | undefined) {
  return !!entry && entry.expires > now();
}

export async function fetchPublicUsers(userIds: string[]): Promise<Record<string, PublicUserInfo>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return {};

  const result: Record<string, PublicUserInfo> = {};
  const missing: string[] = [];

  for (const id of unique) {
    const entry = CACHE.get(id);
    if (isFresh(entry)) {
      result[id] = entry!.value;
    } else {
      missing.push(id);
    }
  }

  if (!missing.length) return result;

  // Batch request for all missing (dedupe any currently pending) – if a batch is already in flight we still include; server handles duplicates.
  // Split into chunks (e.g., 50) if large; current usage small, keep single batch.
  try {
    const res = await fetch('/api/users/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: missing })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.users)) {
        for (const u of data.users as { id: string; email: string; elo: number; name?: string }[]) {
          const info: PublicUserInfo = { email: u.email, elo: u.elo, name: u.name };
            CACHE.set(u.id, { value: info, expires: now() + TTL });
            result[u.id] = info;
        }
      }
    }
  } catch {
    // On network error, silently ignore (callers can decide fallback UI)
  }
  return result;
}

export function primePublicUser(userId: string, info: PublicUserInfo) {
  CACHE.set(userId, { value: info, expires: now() + TTL });
}

// Remove a specific userId from cache to force fresh fetch
export function removePublicUser(userId: string) {
  CACHE.delete(userId);
}

export function clearPublicUserCache() { CACHE.clear(); }
