"use client";
import * as React from 'react';

interface MatchPlayer { userId: string; joinedAt: number; team?: string }

interface UseRandomMatchmakingOptions {
  auto?: boolean; // start immediately
  userId?: string | null;
}

interface MatchmakingState {
  status: 'idle' | 'joining' | 'waiting' | 'started' | 'error';
  players: MatchPlayer[];
  playerCount: number;
  timeRemainingMs: number | null;
  gameId?: string;
  accessToken?: string;
  error?: string;
}

export function useRandomMatchmaking(opts: UseRandomMatchmakingOptions = {}) {
  const { auto = false } = opts;
  const [state, setState] = React.useState<MatchmakingState>({ status: 'idle', players: [], playerCount: 0, timeRemainingMs: null });
  interface PresenceMember { clientId?: string; data?: { userId?: string; joinedAt?: number } }
  interface AblyRealtimeLike {
    connection: { once: (ev: string, cb: (arg?: unknown) => void) => void };
    channels: { get: (name: string) => AblyChannelLike };
  }
  interface AblyChannelLike {
    presence: {
      enter: (data: { userId: string; joinedAt: number }) => Promise<void> | void;
      leave: () => Promise<void> | void;
      subscribe: (event: string | (() => void), listener?: () => void) => void;
      get: (cb: (err: unknown, members: PresenceMember[]) => void) => void;
    };
    subscribe: (event: string, listener: (msg: { data?: unknown }) => void) => void;
  }
  const ablyRef = React.useRef<AblyRealtimeLike | null>(null);
  const channelRef = React.useRef<AblyChannelLike | null>(null);
  const globalRef = React.useRef<AblyChannelLike | null>(null);
  const userIdRef = React.useRef<string | null>(opts.userId || null);
  const cancelledRef = React.useRef(false);
  const [userIdState, setUserIdState] = React.useState<string | null>(userIdRef.current);

  async function ensureUserId(): Promise<string> {
    if (userIdRef.current) return userIdRef.current;
    let stored = null;
    try { stored = localStorage.getItem('userId'); } catch {}
    if (!stored) {
      stored = 'anon-' + Math.random().toString(36).slice(2,10);
      try { localStorage.setItem('userId', stored); } catch {}
    }
    userIdRef.current = stored;
    setUserIdState(stored);
    return stored;
  }

  const connectRealtime = React.useCallback(async () => {
    if (ablyRef.current) return;
    const tokenRes = await fetch('/api/realtime/token');
    const tokenJson = await tokenRes.json();
    const { Realtime } = await import('ably');
    // Cast constructor only (library type variance) but keep internal callbacks strongly typed
    const ably: AblyRealtimeLike = new (Realtime as unknown as { new(options: { authCallback: (params: unknown, cb: (err: Error | null, token: unknown) => void) => void }): AblyRealtimeLike })({
      authCallback: (_params, cb) => cb(null, tokenJson)
    });
    await new Promise<void>((resolve, reject) => {
      ably.connection.once('connected', () => resolve());
      ably.connection.once('failed', (err: unknown) => reject(err instanceof Error ? err : new Error('Realtime failed')));
    });
    ablyRef.current = ably;
    channelRef.current = ably.channels.get('matchmaking-window');
    globalRef.current = ably.channels.get('matchmaking-global');
  }, []);

  const updateFromPresence = React.useCallback((members: PresenceMember[]) => {
    const players: MatchPlayer[] = members.map(m => {
      const data = m.data || {};
      return { userId: data.userId || m.clientId || 'unknown', joinedAt: data.joinedAt || Date.now() };
    }).sort((a,b) => a.joinedAt - b.joinedAt);
    setState(s => ({ ...s, players, playerCount: players.length }));
  }, []);

  const join = React.useCallback(async () => {
    if (cancelledRef.current) return;
    setState(s => ({ ...s, status: 'joining' }));
    try {
      const uid = await ensureUserId();
      await connectRealtime();
      // Enter presence
      if (channelRef.current) {
        await channelRef.current.presence.enter({ userId: uid, joinedAt: Date.now() });
      }
      // Subscribe to presence changes for immediate roster updates
      channelRef.current?.presence.subscribe(() => {
        channelRef.current?.presence.get((err, members) => {
          if (err) return;
          updateFromPresence(members);
        });
      });
      // Subscribe to global events to avoid polling
      globalRef.current?.subscribe('mm.update', (msg) => {
        const raw = msg.data;
        const d = (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>) ? (raw as { data?: unknown }).data : raw) as Record<string, unknown> | undefined;
        setState(s => ({ ...s, timeRemainingMs: typeof d?.timeRemainingMs === 'number' ? d.timeRemainingMs : s.timeRemainingMs, playerCount: typeof d?.players === 'number' ? d.players : s.playerCount }));
      });
      globalRef.current?.subscribe('mm.started', (msg) => {
        const raw = msg.data;
        const d = (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>) ? (raw as { data?: unknown }).data : raw) as Record<string, unknown> | undefined;
        const players = Array.isArray(d?.players) ? d.players as MatchPlayer[] : [];
        if (typeof d?.gameId === 'string') {
          let token: string | undefined;
          try {
            const uid = userIdRef.current;
            if (uid && Array.isArray((d as Record<string, unknown>).tokens)) {
              const tokens = (d as { tokens?: { userId?: string; token?: string }[] }).tokens;
              const match = tokens?.find((t) => t.userId === uid);
              token = match?.token;
            }
          } catch {}
          setState(s => ({ ...s, status: 'started', gameId: d.gameId as string, players: players.length ? players : s.players, accessToken: token || s.accessToken }));
        }
        // Optional: navigate outside hook (user of hook can effect when state.status === 'started')
      });
      // Initial server sync
      const res = await fetch('/api/matchmaking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'join', userId: uid }) });
      const data = await res.json();
      if (data.status === 'started' && data.gameId) {
        setState(s => ({ ...s, status: 'started', gameId: data.gameId, accessToken: data.token || s.accessToken }));
        return;
      }
      // Transition to waiting
      setState(s => ({ ...s, status: 'waiting', playerCount: data.players || s.playerCount, timeRemainingMs: data.timeRemainingMs ?? s.timeRemainingMs }));
      // Initial presence snapshot
  channelRef.current?.presence.get((err, members) => { if (!err) updateFromPresence(members); });
    } catch (e: unknown) {
      const message = typeof e === 'object' && e && 'message' in e ? (e as { message?: string }).message : 'Failed to join matchmaking';
      setState(s => ({ ...s, status: 'error', error: message || 'Failed to join matchmaking' }));
    }
  }, [connectRealtime, updateFromPresence]);

  async function cancel() {
    cancelledRef.current = true;
    try {
      if (channelRef.current) {
        try { await channelRef.current.presence.leave(); } catch {}
      }
      await fetch('/api/matchmaking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', userId: userIdRef.current }) });
    } finally {
      setState(s => ({ ...s, status: 'idle', timeRemainingMs: null, playerCount: 0 }));
    }
  }

  React.useEffect(() => { if (auto) join(); }, [auto, join]);

  return { ...state, join, cancel, userId: userIdState };
}
