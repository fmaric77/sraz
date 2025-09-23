"use client";
import React, { useEffect, useState, useRef } from 'react';

interface LobbyProps { lobbyId: string }
interface LobbyPlayer { userId: string; team: string }
interface LobbyData { lobbyCode: string; hostUserId: string; maxPlayers: number; status: string; players: LobbyPlayer[]; gameId?: string }

const LobbyComponent: React.FC<LobbyProps> = ({ lobbyId }) => {
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  async function load(code: string) {
    try {
      const res = await fetch(`/api/lobbies/${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed lobby fetch');
      setLobby(data.lobby);
      if (data.lobby?.gameId) window.location.href = `/game?g=${data.lobby.gameId}`;
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message || 'Failed to fetch lobby');
      else setError('Failed to fetch lobby');
    }
  }

  useEffect(() => {
    let id = localStorage.getItem('userId');
    if (!id) { id = 'anon-' + Math.random().toString(36).slice(2,8); localStorage.setItem('userId', id); }
    setUserId(id);
  }, []);

  useEffect(() => {
    let aborted = false;
    (async () => {
      if (lobbyId === 'new') {
        setStatus('Creating lobby...');
        try {
          const res = await fetch('/api/lobbies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxPlayers: 4 }) });
          const data = await res.json();
          if (aborted) return;
          if (!res.ok) { setError(data.error || 'Create failed'); return; }
          const hostId = data.lobby?.players?.[0]?.userId;
          if (hostId) { try { localStorage.setItem('userId', hostId); } catch {} }
          setUserId(hostId || null);
          setLobby(data.lobby);
          setStatus('Lobby created');
          window.history.replaceState(null, '', `/lobby/${data.lobby.lobbyCode}`);
          pollRef.current = window.setInterval(() => load(data.lobby.lobbyCode), 3500);
          return;
        } catch (e: unknown) {
          if (e instanceof Error) setError(e.message || 'Create failed');
          else setError('Create failed');
        }
      } else {
        await load(lobbyId);
        pollRef.current = window.setInterval(() => load(lobbyId), 3500);
      }
    })();
    return () => { aborted = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [lobbyId]);

  async function join() {
    if (!lobby || !userId) return;
    if (lobby.players.some(p=>p.userId===userId)) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/lobbies/${lobby.lobbyCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'join', userId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Join failed');
      if (data.userId) { try { localStorage.setItem('userId', data.userId); } catch {} }
      setLobby(data.lobby);
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message || 'Join failed');
      else setError('Join failed');
    } finally { setJoining(false); }
  }

  async function startGame() {
    if (!lobby) return;
    if (lobby.status !== 'open') return;
    if (lobby.players.length < 2) { setError('Need at least 2 players'); return; }
    setStarting(true);
    try {
      const res = await fetch(`/api/lobbies/${lobby.lobbyCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Start failed');
      if (data.gameId) window.location.href = `/game?g=${data.gameId}`;
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message || 'Start failed');
      else setError('Start failed');
    } finally { setStarting(false); }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start p-6 text-slate-100">
      <div className="w-full max-w-lg space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Lobby</h1>
        {status && <div className="text-xs text-slate-400">{status}</div>}
        {error && (
          <div className="p-2 text-sm rounded bg-rose-900/40 border border-rose-600/40 text-rose-300 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={()=> setError(null)} className="text-[10px] px-2 py-0.5 rounded bg-rose-700/40 hover:bg-rose-600/50">x</button>
          </div>
        )}
        {!lobby && !error && (
          <div className="text-sm text-slate-400 animate-pulse">Loading lobby...</div>
        )}
        {lobby && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">Code: <span className="font-mono text-indigo-300">{lobby.lobbyCode}</span></div>
                <div className="text-[11px] text-slate-400">Status: {lobby.status}</div>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(window.location.href).catch(()=>{}); setStatus('Link copied'); setTimeout(()=> setStatus(''), 1500); }} className="px-3 py-1 rounded bg-slate-700 text-[11px] hover:bg-slate-600">Copy Link</button>
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300">Players ({lobby.players.length}/{lobby.maxPlayers})</h2>
              <ul className="space-y-1">
                {lobby.players.map(p => (
                  <li key={p.userId} className="flex items-center justify-between px-3 py-2 rounded bg-slate-800/60 border border-slate-700 text-[12px]">
                    <span className="font-mono truncate max-w-[140px]" title={p.userId}>{p.userId}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-600/30 border border-indigo-500/30">Team {p.team}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 flex-wrap">
              {userId && !lobby.players.some(p=>p.userId===userId) && lobby.status === 'open' && (
                <button disabled={joining} onClick={join} className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-emerald-500">{joining ? 'Joining...' : 'Join'}</button>
              )}
              {userId && lobby.hostUserId === userId && lobby.status === 'open' && (
                <button disabled={starting || lobby.players.length < 2} onClick={startGame} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-indigo-500">{starting ? 'Starting...' : 'Start Game'}</button>
              )}
              {lobby.status !== 'open' && !lobby.gameId && (
                <div className="text-xs text-slate-400">Preparing game...</div>
              )}
            </div>
            {lobby.gameId && (
              <div className="text-xs text-emerald-400">Game starting... redirecting</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const LobbyClient = LobbyComponent;
export default LobbyComponent;
