// Lightweight opaque token generator (non-crypto secure fallback acceptable for session gating)
export function generateAccessToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as { randomUUID?: () => string }).randomUUID?.() || cryptoRandomFallback();
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function cryptoRandomFallback(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
