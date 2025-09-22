"use client";
import React, { useEffect, useState, useRef } from 'react';

interface LobbyState {
  lobbyCode: string;
  maxPlayers: number;
  players: { team: string; userId: string }[];
  status?: string;
  gameId?: string;
}

interface Props { lobbyId: string; }

export const LobbyClient: React.FC<Props> = ({ lobbyId }) => {
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const realtimeReady = useRef(false);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial create/join
  useEffect(() => {
    let aborted = false;
    async function init() {
      if (lobbyId === 'new') {
        setStatus('Creating lobby...');
        const res = await fetch('/api/lobbies', { method: 'POST', body: JSON.stringify({ maxPlayers: 4 }) });
        const data = await res.json();
        if (aborted) return;
        if (!res.ok) { setError(data.error || 'Create failed'); return; }
        // persist host user id if returned
        if (data.lobby?.players?.[0]?.userId) {
          try { localStorage.setItem('userId', data.lobby.players[0].userId); } catch {}
        }
        setLobby(data.lobby);
        setStatus('Lobby created');
        window.history.replaceState(null, '', `/lobby/${data.lobby.lobbyCode}`);
      } else {
        setStatus('Joining lobby...');
        const joinRes = await fetch(`/api/lobbies/${lobbyId}`, { method: 'POST', body: JSON.stringify({ action: 'join' }) });
        const joinData = await joinRes.json();
        if (aborted) return;
        if (!joinRes.ok) { setError(joinData.error || 'Join failed'); return; }
        if (joinData.userId) {
          try { localStorage.setItem('userId', joinData.userId); } catch {}
        }
        setLobby(joinData.lobby);
        setStatus('Joined lobby');
      }
    }
    init();
    return () => { aborted = true; };
  }, [lobbyId]);

  // Polling fallback (always on until realtime attaches, then cleared)
  useEffect(() => {
    if (!lobby) return;
    if (polling.current) return; // already polling
    polling.current = setInterval(async () => {
      if (realtimeReady.current) return; // stop when realtime active (will clear below)
      const res = await fetch(`/api/lobbies/${lobby.lobbyCode}`);
      const data = await res.json();
      if (res.ok && data.lobby) setLobby(data.lobby);
    }, 2500);
    return () => { if (polling.current) clearInterval(polling.current); };
  }, [lobby]);

  // Realtime subscription
  useEffect(() => {
    if (!lobby) return;
    const code = lobby.lobbyCode;
  interface LobbyEventMessage { name: string; data?: { data?: { gameId?: string } } }
  interface AblyChannel { subscribe: (cb: (msg: LobbyEventMessage) => void) => void; detach?: ()=>void }
  interface AblyRealtime { channels: { get: (name: string) => AblyChannel }; close?: ()=>void }
  let channel: AblyChannel | null = null;
  let client: AblyRealtime | null = null; let mounted = true;
    (async () => {
      try {
        const tokenRes = await fetch('/api/realtime/token');
        if (!tokenRes.ok) { setRealtimeError('Realtime unavailable (token error)'); return; }
  const { Realtime } = await import('ably');
  // @ts-expect-error minimal runtime type capture; library types handled at build time
  client = new Realtime({ authUrl: '/api/realtime/token' });
  if (!client) throw new Error('Realtime client not initialized');
  channel = client.channels.get(`lobby-${code}`);
  channel!.subscribe((msg: LobbyEventMessage) => {
          if (!mounted) return;
          if (msg.name === 'player.joined') {
            fetch(`/api/lobbies/${code}`).then(r => r.json()).then(d => { if (d.lobby) setLobby(d.lobby); });
          } else if (msg.name === 'lobby.started') {
            const gameId = msg.data?.data?.gameId;
            if (gameId) window.location.href = `/game?g=${gameId}`;
          }
        });
        realtimeReady.current = true;
        if (polling.current) { clearInterval(polling.current); polling.current = null; }
      } catch (_e: unknown) {
        setRealtimeError('Realtime unavailable');
      }
    })();
    return () => { mounted = false; channel?.detach?.(); client?.close?.(); };
  }, [lobby]);

  async function startGame() {
    if (!lobby) return;
    if (lobby.players.length < 2) return;
    setStatus('Starting game...');
    const res = await fetch(`/api/lobbies/${lobby.lobbyCode}`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Start failed'); return; }
    if (data.gameId) window.location.href = `/game?g=${data.gameId}`;
  }

  const isHost = !!(lobby && lobby.players[0]);
  const inviteLink = typeof window !== 'undefined' && lobby ? `${window.location.origin}/lobby/${lobby.lobbyCode}` : '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-6 text-slate-200 bg-slate-900">
      <h1 className="text-2xl font-bold mb-4">Lobby</h1>
      {error && <div className="bg-red-600/30 border border-red-500 px-4 py-2 rounded mb-4 text-sm">{error}</div>}
      {realtimeError && <div className="bg-amber-600/30 border border-amber-500 px-4 py-2 rounded mb-4 text-xs">{realtimeError} (polling fallback active)</div>}
      {!error && !lobby && <p className="text-sm opacity-70">{status}</p>}
      {lobby && (
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white/5 rounded p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">Lobby ID:</span>
              <code className="text-amber-300 text-xs">{lobby.lobbyCode}</code>
            </div>
            <p className="text-xs mb-3">Players ({lobby.players.length}/{lobby.maxPlayers}) {lobby.players.length < 2 && '(need at least 2 to start)'}</p>
            <ul className="text-xs space-y-1 mb-4">
              {lobby.players.map(p => (
                <li key={`${p.userId}-${p.team}`} className="flex justify-between">
                  <span>Team {p.team}</span>
                  <span className="opacity-70">{p.userId}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] uppercase tracking-wide mb-1">Invite Link</label>
                <input readOnly value={inviteLink} className="w-full bg-slate-800 text-[11px] px-2 py-1 rounded border border-slate-600" />
              </div>
              {isHost && lobby.status === 'open' && (
                <button
                  onClick={startGame}
                  disabled={lobby.players.length < 2}
                  className={`w-full text-sm py-2 rounded font-semibold transition ${lobby.players.length < 2 ? 'bg-slate-600 cursor-not-allowed opacity-60' : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700'}`}
                >
                  {lobby.players.length < 2 ? 'Waiting for another player…' : 'Start Game'}
                </button>
              )}
              {lobby.status === 'started' && <p className="text-xs text-emerald-400">Game started. Redirecting...</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
