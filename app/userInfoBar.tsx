'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface MeResponse { user: { id: string; email: string; elo: number } | null }

export function UserInfoBar() {
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/user/me', { cache: 'no-store' });
        const j = await r.json();
        setMe(j.user);
      } finally { setLoading(false); }
    })();
  }, []);
  return (
    <header className="w-full border-b bg-white/60 backdrop-blur px-4 py-2 flex items-center justify-between text-sm">
  <Link href="/" className="font-semibold">Mind Siege</Link>
      <div className="flex items-center gap-4">
        {loading ? <span className="text-gray-500">...</span> : me ? (
          <>
            <span className="text-gray-700">{me.email} <span className="font-medium">({me.elo})</span></span>
            <Link href="/settings" className="hover:text-blue-600" aria-label="Settings">⚙️</Link>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:underline">Login</Link>
            <Link href="/register" className="hover:underline">Register</Link>
          </>
        )}
      </div>
    </header>
  );
}
