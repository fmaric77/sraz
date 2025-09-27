'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

interface CurrentUserContextValue {
  userId: string | null;
  email: string | null;
  name: string | null;
  language: string | null;
  elo: number | null;
  purchasedSkins: string[];
  selectedBoardSkin: string | null;
  setOptimisticName: (name: string) => void;
  refresh: () => Promise<void>;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used within CurrentUserProvider');
  return ctx;
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [elo, setElo] = useState<number | null>(null);
  const [purchasedSkins, setPurchasedSkins] = useState<string[]>([]);
  const [selectedBoardSkin, setSelectedBoardSkinState] = useState<string | null>(null);

  interface SessionUser { id?: string; email?: string | null; name?: string | null; elo?: number }
  interface SessionShape { user?: SessionUser; userId?: string }
  const ingest = useCallback((payload: SessionShape | null) => {
    if (!payload || !payload.user) return;
    const { user } = payload;
    setUserId(payload.userId || user.id || null);
    setEmail(user.email || null);
    setName(user.name || null);
    setElo(user.elo ?? null);
    // Best-effort: session may not include skins; they'll refresh via /api/user/me
  }, []);

  useEffect(() => {
    if (session) ingest(session);
  }, [session, ingest]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/user/me');
      const data = await res.json().catch(()=>({}));
      if (data?.user) {
        setUserId(data.user.id || null);
        setEmail(data.user.email || null);
        setName(data.user.name || null);
        setLanguage(data.user.language || null);
        setElo(data.user.elo ?? null);
        setPurchasedSkins(data.user.purchasedSkins || []);
        setSelectedBoardSkinState(data.user.selectedBoardSkin || null);
      }
    } catch {}
  }, []);

  // Fetch full profile (including cosmetics) once session is known
  useEffect(() => {
    if (session?.user?.email) {
      refresh();
    }
  }, [session?.user?.email, refresh]);

  const setOptimisticName = useCallback((next: string) => {
    setName(next);
  }, []);

  return (
    <CurrentUserContext.Provider value={{ userId, email, name, language, elo, purchasedSkins, selectedBoardSkin, setOptimisticName, refresh }}>
      {children}
    </CurrentUserContext.Provider>
  );
}
