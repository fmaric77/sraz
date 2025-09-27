"use client";
import React, { useEffect } from 'react';
import { useRandomMatchmaking } from '@/app/hooks/useRandomMatchmaking';
import { fetchPublicUsers } from '@/lib/userPublicCache';

interface PublicInfo { email: string; elo: number; name?: string }

export default function QueuePage() {
  const { status, join, cancel, players, playerCount, timeRemainingMs, gameId, accessToken, error, userId } = useRandomMatchmaking({ auto: true });
  const [userMap, setUserMap] = React.useState<Record<string, PublicInfo>>({});
  const [copied, setCopied] = React.useState(false);
  const [flash, setFlash] = React.useState(false);
  const lastRemainingRef = React.useRef<number | null>(null);

  // Detect timer reset (increase in remaining seconds) => flash
  useEffect(() => {
    if (status !== 'waiting' || timeRemainingMs == null) return;
    const secs = Math.ceil(timeRemainingMs / 1000);
    if (lastRemainingRef.current != null && secs > (lastRemainingRef.current + 1)) { // allow 1s jitter
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }
    lastRemainingRef.current = secs;
  }, [timeRemainingMs, status]);

  // Enrich player identities (best effort; anonymous players will just show id)
  const playerIdsKey = React.useMemo(() => players.map(p=>p.userId).join(','), [players]);
  useEffect(() => {
    const ids = players.map(p => p.userId).filter(id => !id.startsWith('anon-'));
    if (!ids.length) return;
    let mounted = true;
    (async () => {
      const data = await fetchPublicUsers(ids);
      if (!mounted) return;
      setUserMap(m => ({ ...m, ...data }));
    })();
    return () => { mounted = false; };
  }, [playerIdsKey, players, userId]);

  // Redirect when started
  useEffect(() => {
    if (status === 'started' && gameId) {
      const url = accessToken ? `/game/${gameId}?accessToken=${encodeURIComponent(accessToken)}` : `/game/${gameId}`;
      window.location.href = url;
    }
  }, [status, gameId, accessToken]);

  const remainingSecs = timeRemainingMs != null ? Math.ceil(timeRemainingMs / 1000) : null;

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-6 relative game-bg overflow-hidden">
      <div className="bg-orb-container">
        <div className="bg-orb" style={{ top: '-140px', left: '-160px', background: 'radial-gradient(circle at 30% 30%, rgba(34,211,238,0.5), transparent 70%)' }} />
        <div className="bg-orb alt" style={{ bottom: '-180px', right: '-150px', background: 'radial-gradient(circle at 65% 65%, rgba(147,51,234,0.45), transparent 70%)' }} />
      </div>
      <div className="w-full max-w-xl space-y-6 relative z-10 fade-in-up">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => { window.location.href = '/'; }} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px]">Home</button>
            <h1 className="text-xl font-semibold tracking-tight">Random Match Queue</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(()=>{ setCopied(true); setTimeout(()=> setCopied(false), 1500); }).catch(()=>{});
              }}
              className="px-3 py-1 rounded bg-slate-700 text-[11px] hover:bg-slate-600"
            >{copied ? 'Copied' : 'Copy Link'}</button>
          </div>
        </header>
        <div className="text-xs text-slate-400 -mt-3">Automatically groups 2-4 players. Timer resets when a new player joins (until full).</div>
  <div className={"glass-panel panel-border-gradient p-5 space-y-5 relative overflow-hidden " + (flash ? 'ring-2 ring-indigo-400 animate-pulse' : '')}>
          <div className="flex items-center justify-between text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-slate-300 font-medium">Status: {status === 'waiting' ? 'Waiting' : status.charAt(0).toUpperCase()+status.slice(1)}</span>
              {remainingSecs != null && status === 'waiting' && (
                <span className="text-[11px] text-slate-400">Auto-start in <span className="text-indigo-300 font-semibold">{remainingSecs}s</span> or when 4 players join.</span>
              )}
              {status === 'waiting' && playerCount >= 2 && playerCount < 4 && (
                <span className="text-[11px] text-slate-500">Waiting for up to {4 - playerCount} more player{4 - playerCount === 1 ? '' : 's'}...</span>
              )}
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400">Players</span>
              <div className="text-sm font-mono">{playerCount}/4</div>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300">Players</h2>
            <ul className="space-y-1">
              {players.map((p, idx) => {
                const info = userMap[p.userId];
                const label = info?.name || info?.email?.split('@')[0] || p.userId.replace(/^anon-/, 'guest-');
                const team = ['A','B','C','D'][idx] as 'A' | 'B' | 'C' | 'D';
                return (
                  <li key={p.userId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-[12px] fade-in-up">
                    <span className="truncate max-w-[140px]" title={p.userId}>{label}</span>
                    <span className={
                      'px-2 py-0.5 rounded text-[11px] font-medium border ' +
                      (team === 'A' ? 'bg-blue-600/25 border-blue-500/40 text-blue-200' :
                       team === 'B' ? 'bg-red-600/25 border-red-500/40 text-red-200' :
                       team === 'C' ? 'bg-green-600/25 border-green-500/40 text-green-200' :
                                      'bg-yellow-600/25 border-yellow-500/40 text-yellow-200')
                    }>Team {team}</span>
                  </li>
                );
              })}
              {players.length === 0 && (
                <li className="px-3 py-2 rounded bg-slate-900/40 border border-slate-700 text-[12px] text-slate-500">No players yet...</li>
              )}
            </ul>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            {status === 'waiting' || status === 'joining' ? (
              <button onClick={cancel} className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium disabled:opacity-50 hover-glass">Cancel</button>
            ) : status === 'idle' ? (
              <button onClick={join} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium hover-glass">Join Queue</button>
            ) : null}
            {status === 'waiting' && playerCount >= 2 && userId && players[0]?.userId === userId && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/matchmaking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'forceStart', userId }) });
                    const data = await res.json();
                    if (res.ok && data.gameId) {
                      const url = data.token ? `/game/${data.gameId}?accessToken=${encodeURIComponent(data.token)}` : `/game/${data.gameId}`;
                      window.location.href = url;
                    }
                  } catch {}
                }}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium hover-glass"
              >Start Now</button>
            )}
            {status === 'started' && <div className="text-xs text-emerald-400">Starting game...</div>}
            {error && <div className="text-xs text-rose-400">{error}</div>}
          </div>
        </div>
        <div className="text-[11px] text-slate-500 leading-snug">
          Leaving this page (or cancelling) removes you from the queue. Teams are assigned by join order (A-D) when the game starts.
        </div>
      </div>
    </div>
  );
}
