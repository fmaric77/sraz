"use client";
import React, { useEffect, useState, useRef } from 'react';
import Board from './components/Board';
import QuestionModal from './components/QuestionModal';
import { Piece, Team, Game as FullGame } from '@/models/types';
import { Avatar } from '@/app/components/Avatar';
import { fetchPublicUsers } from '@/lib/userPublicCache';
import { createLocalGame } from '@/lib/board';
import { resolveCombatAndMove, CombatEvent, ResolveResult } from '@/lib/combat';

interface GameStateLite {
  _id?: string;
  boardCategories: string[][];
  pieces: Piece[];
  blackHoles?: { x: number; y: number }[];
  players?: { userId: string; team: Team }[];
  turnOfUserId?: string;
}

export default function GamePage() {
  const [game, setGame] = useState<GameStateLite | null>(null);
  const [selected, setSelected] = useState<{x:number;y:number}|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [turnTeam, setTurnTeam] = useState<Team>('A');
  const [localPlayerCount, setLocalPlayerCount] = useState(2);
  const [gameChannelReady, setGameChannelReady] = useState(false);
  const [membershipDenied, setMembershipDenied] = useState(false);
  interface GameAblyMessage { name: string; data: unknown }
  interface GameAblyChannel { subscribe: (cb: (msg: GameAblyMessage) => void) => void; unsubscribe?: () => void }
  interface GameAblyClient { channels: { get: (name: string) => GameAblyChannel }; close?: () => void }
  const ablyClientRef = useRef<GameAblyClient | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ pieceId: string; toX: number; toY: number; category: string } | null>(null);
  const [question, setQuestion] = useState<{ id?: string; text: string; choices: string[]; correctIndex?: number } | null>(null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [toast, setToast] = useState<{ id: number; type: 'success' | 'error'; message: string } | null>(null);
  const [lastMovedPieceId, setLastMovedPieceId] = useState<string | null>(null);
  const [questionHistory, setQuestionHistory] = useState<{ qid?: string; correct: boolean; category: string }[]>([]);
  const [recentEvents, setRecentEvents] = useState<CombatEvent[] | null>(null);
  const [gameOver, setGameOver] = useState<{ winner: 'A' | 'B'; reason: string } | null>(null);
  const toastCounter = React.useRef(0);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [playerInfo, setPlayerInfo] = useState<Record<string, { email: string; elo: number; name?: string }> | null>(null);

  // Typed helper to safely coerce unknown realtime payloads for 'game.turn' events
  interface GameTurnPayload { nextTurnUserId?: string; incorrect?: boolean }
  function asTurnPayload(d: unknown): GameTurnPayload {
    if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      return {
        nextTurnUserId: typeof o.nextTurnUserId === 'string' ? o.nextTurnUserId : undefined,
        incorrect: o.incorrect === true,
      };
    }
    return {};
  }

  // Sync turnTeam with game.turnOfUserId whenever game changes
  useEffect(() => {
    if (game?.turnOfUserId && game.players) {
      const p = game.players.find(pl => pl.userId === game.turnOfUserId);
      if (p) setTurnTeam(p.team);
    }
  }, [game?.turnOfUserId, game?.players]);

  // If arriving from a lobby start, a game id (?g=) will be in the URL. Auto-load that game and skip selection UI.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('g');
    if (!gid) return; // stay idle for local/creation options
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/games/${gid}`);
  interface GameResponse { game?: FullGame; error?: string }
  const data: GameResponse = await res.json();
  if (!res.ok || !data.game) throw new Error(data.error || 'Game load failed');
        // Basic membership validation: require a userId stored in localStorage that appears in game.players.
        let userId = localStorage.getItem('userId');
        if (!userId) {
          userId = 'anon-' + Math.random().toString(36).slice(2,8);
          localStorage.setItem('userId', userId);
        }
        setCurrentUserId(userId);
  const member = data.game.players?.find((p) => p.userId === userId);
        const isMember = !!member;
        if (!isMember) {
          // Instead of blocking completely, mark denied but still show board as spectator (no moves)
          setMembershipDenied(true);
        }
        if (member) setMyTeam(member.team);
  const validTeams = new Set(data.game.players.map((p)=> p.team));
  const filteredPieces = data.game.pieces.filter((p)=> validTeams.has(p.team));
        if (filteredPieces.length !== data.game.pieces.length) {
          // Optional: log discrepancy for debugging
          console.warn('Filtered out pieces from non-player teams', data.game.pieces.length - filteredPieces.length);
        }
        setGame({ _id: data.game._id, boardCategories: data.game.boardCategories, pieces: filteredPieces, blackHoles: data.game.blackHoles, players: data.game.players, turnOfUserId: data.game.turnOfUserId });
        // Hydrate server question history (categories not stored; show as unknown until future enhancement)
        if (data.game.questionHistory?.length) {
          setQuestionHistory(
            data.game.questionHistory.map(
              (h: FullGame['questionHistory'][number]) => ({ qid: h.questionId, correct: h.correct, category: '—' })
            )
          );
        }
        setPersisted(true);
        // Derive current team from turnOfUserId
  const turnPlayer = data.game?.players.find((p)=> p.userId === data.game!.turnOfUserId);
        if (turnPlayer) setTurnTeam(turnPlayer.team);
        else setTurnTeam('A');
        setLocalMode(false);
      } catch (e: unknown) {
        const msg = typeof e === 'object' && e && 'message' in e ? (e as { message?: string }).message : 'Failed loading game';
        setError(msg || 'Failed loading game');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Subscribe to realtime move events when remote game id present (stable subscription)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('g');
    if (!gid) return; // local mode: skip
    if (!game?._id || game._id !== gid) return; // wait until correct game loaded
  let channel: GameAblyChannel | null = null;
  let client: GameAblyClient | null = null;
  interface AblyEnvelope { type: string; data: unknown; ts: number }
  interface GameMovePayload { pieces?: Piece[]; nextTurnUserId?: string }
    let mounted = true;
    (async () => {
      try {
        const tokenRes = await fetch('/api/realtime/token');
        if (!tokenRes.ok) return;
        const { Realtime } = await import('ably');
        // @ts-expect-error runtime-only usage; library typings present in dep
        client = new Realtime({ authUrl: '/api/realtime/token' });
        ablyClientRef.current = client;
  if (!client) throw new Error('Realtime client not initialized');
  channel = client.channels.get(`game-${gid}`);
  channel.subscribe((msg: GameAblyMessage) => {
          if (!mounted) return;
          if (msg.name === 'game.move') {
            const envelope = msg.data as AblyEnvelope | GameMovePayload;
            const payload: GameMovePayload = (envelope as AblyEnvelope).data && typeof (envelope as AblyEnvelope).data === 'object'
              ? (envelope as AblyEnvelope).data as GameMovePayload
              : (envelope as GameMovePayload);
            if (payload?.pieces) {
              setGame(g => {
                if (!g) return g;
                const validTeams = new Set((g.players||[]).map(p=>p.team));
                const sanitized = (payload.pieces || []).filter((p)=> validTeams.has(p.team));
                if (sanitized.length !== (payload.pieces || []).length) {
                  console.warn('Sanitized extraneous team pieces from realtime payload');
                }
                return { ...g, pieces: sanitized, turnOfUserId: payload.nextTurnUserId || g.turnOfUserId };
              });
              if (payload?.nextTurnUserId && game?.players) {
                const nextPlayer = game.players.find(p => p.userId === payload.nextTurnUserId);
                if (nextPlayer) setTurnTeam(nextPlayer.team);
              }
            } else {
              fetch(`/api/games/${gid}`)
                .then(r => r.json())
                .then(data => {
                  if (data.game) {
                    setGame({
                      _id: data.game._id,
                      boardCategories: data.game.boardCategories,
                      pieces: data.game.pieces,
                      blackHoles: data.game.blackHoles,
                      players: data.game.players,
                      turnOfUserId: data.game.turnOfUserId,
                    });
                    if (data.game.questionHistory?.length) {
                      setQuestionHistory(
                        data.game.questionHistory.map(
                          (h: FullGame['questionHistory'][number]) => ({ qid: h.questionId, correct: h.correct, category: '—' })
                        )
                      );
                    }
                  }
                });
            }
          } else if (msg.name === 'game.turn') {
            const envelope = msg.data as AblyEnvelope;
            const payload = asTurnPayload(envelope.data);
            if (payload.nextTurnUserId) {
              setGame(g => g ? { ...g, turnOfUserId: payload.nextTurnUserId } : g);
              if (game?.players) {
                const nextPlayer = game.players.find(p => p.userId === payload.nextTurnUserId);
                if (nextPlayer) setTurnTeam(nextPlayer.team);
              }
            }
            if (payload.incorrect) {
              setToast({ id: ++toastCounter.current, type: 'error', message: 'Incorrect – Turn Lost.' });
            }
          } else if (msg.name === 'game.finished') {
            // Force reload final state on finish
            fetch(`/api/games/${gid}`)
              .then(r => r.json())
              .then(data => {
                if (data.game) {
                  setGame({
                    _id: data.game._id,
                    boardCategories: data.game.boardCategories,
                    pieces: data.game.pieces,
                    blackHoles: data.game.blackHoles,
                    players: data.game.players,
                    turnOfUserId: data.game.turnOfUserId,
                  });
                    if (data.game.questionHistory?.length) {
                      setQuestionHistory(
                        data.game.questionHistory.map(
                          (h: FullGame['questionHistory'][number]) => ({ qid: h.questionId, correct: h.correct, category: '—' })
                        )
                      );
                    }
                }
              });
          }
        });
        setGameChannelReady(true);
      } catch (e: unknown) {
        console.warn('Realtime subscribe failed', e);
      }
    })();
    return () => {
      mounted = false;
      try { channel?.unsubscribe?.(); } catch {}
      try { client?.close?.(); } catch {}
    };
  }, [game?._id]);

  // Fetch public player info when game players known (with caching)
  useEffect(() => {
    if (!game?.players || !game.players.length) return;
    const ids = game.players.map(p=>p.userId);
    let mounted = true;
    (async () => {
      const data = await fetchPublicUsers(ids);
      if (!mounted) return;
      const map: Record<string, { email: string; elo: number; name?: string }> = {};
      Object.entries(data).forEach(([id, v]) => { map[id] = { email: v.email, elo: v.elo, name: v.name }; });
      setPlayerInfo(map);
    })();
    return () => { mounted = false; };
  }, [game?.players]);

  async function createGame() {
    setLoading(true); setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(()=> controller.abort(), 8000);
      const res = await fetch('/api/games', {
        method: 'POST',
        body: JSON.stringify({ creatorUserId: 'demo-user' }),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok || !data.game) {
        throw new Error(data.error || 'Failed creating game');
      }
    setGame({ _id: data.game._id, boardCategories: data.game.boardCategories, pieces: data.game.pieces, blackHoles: data.game.blackHoles });
    setTurnTeam('A');
    setLocalMode(false);
      setPersisted(!!data.persisted);
    } catch (e: unknown) {
      console.error(e);
      function isAbortError(v: unknown): v is { name: string } {
        return !!v && typeof v === 'object' && 'name' in v && (v as { name?: unknown }).name === 'AbortError';
      }
      function hasMessage(v: unknown): v is { message: string } {
        return !!v && typeof v === 'object' && 'message' in v && typeof (v as { message?: unknown }).message === 'string';
      }
      let message = 'Unknown error';
      if (isAbortError(e)) message = 'Request timed out.';
      else if (hasMessage(e)) message = e.message;
      setError(message);
      setGame(null);
    } finally {
      setLoading(false);
    }
  }

  // Apply the pending move after a question is answered (or skipped on fallback)
  async function applyPendingMove(remote: boolean) {
    if (!pendingMove || !game) return;
    const { pieceId, toX, toY } = pendingMove;
    if (remote && game._id) {
      // remote authoritative move via API
      try {
        const userId = localStorage.getItem('userId');
        if (game.turnOfUserId && userId !== game.turnOfUserId) {
          setToast({ id: ++toastCounter.current, type: 'error', message: 'Not your turn' });
          setPendingMove(null); setSelected(null);
          return;
        }
        const res = await fetch(`/api/games/${game._id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pieceId, toX, toY, userId }) });
        if (!res.ok) {
          const data = await res.json().catch(()=>({}));
          setToast({ id: ++toastCounter.current, type: 'error', message: data.error || 'Move rejected' });
        }
      } catch (e) {
        setToast({ id: ++toastCounter.current, type: 'error', message: 'Network error' });
      }
      setPendingMove(null);
      setSelected(null);
      return;
    }
    // Local (offline / localMode) path retains existing logic
    let tempResult: ResolveResult | null = null;
    setGame(g => {
      if (!g) return g;
      tempResult = resolveCombatAndMove({ pieces: g.pieces, attackerId: pieceId, toX, toY, blackHoles: g.blackHoles });
      return { ...g, pieces: tempResult.pieces };
    });
    if (tempResult) {
      const evs = (tempResult as ResolveResult).events;
      setRecentEvents(evs);
      const promo = evs.find(e => e.type === 'promotion') as (CombatEvent & { type: 'promotion' }) | undefined;
      const kill = evs.find(e => e.type === 'kill') as (CombatEvent & { type: 'kill' }) | undefined;
      const demo = evs.find(e => e.type === 'demotion') as (CombatEvent & { type: 'demotion' }) | undefined;
      if (promo) {
        setToast({ id: ++toastCounter.current, type: 'success', message: `Promotion: Level ${promo.fromLevel} -> ${promo.toLevel}` });
      } else if (kill) {
        setToast({ id: ++toastCounter.current, type: 'success', message: `Enemy piece destroyed (${kill.reason === 'pushed-out' ? 'pushed off board' : 'captured'})` });
      } else if (demo) {
        setToast({ id: ++toastCounter.current, type: 'success', message: `Enemy demoted to level ${demo.toLevel}` });
      } else if (evs.length) {
        setToast({ id: ++toastCounter.current, type: 'success', message: 'Move resolved.' });
      }
    }
    setTurnTeam(prev => {
      if (!game) return prev;
      const teamsInGame: Team[] = Array.from(new Set(game.pieces.filter(p=>p.alive).map(p => p.team)));
      const base = ['A','B','C','D'] as const;
      const order: Team[] = base.filter(t => teamsInGame.includes(t));
      const idx = order.indexOf(prev);
      return order[(idx + 1) % order.length];
    });
    setPendingMove(null);
    setSelected(null);
    setLastMovedPieceId(pieceId);
    setTimeout(() => {
      setLastMovedPieceId(id => (id === pieceId ? null : id));
    }, 4000);
    setTimeout(() => {
      setGame(g => {
        if (!g) return g;
        const aliveTeams = Array.from(new Set(g.pieces.filter(p=>p.alive).map(p=>p.team))) as Team[];
        if (aliveTeams.length === 1) {
          const winner = aliveTeams[0];
          setGameOver({ winner: winner as 'A' | 'B', reason: 'all pieces eliminated' });
          setToast({ id: ++toastCounter.current, type: 'success', message: `Team ${winner} wins!` });
        }
        return g;
      });
    }, 50);
  }

  return (
  <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 game-bg text-slate-100">
      <div className="w-full max-w-6xl flex flex-col items-center gap-4">
        {game && (
          <div className="flex flex-col items-center gap-1">
            <div className="text-sm text-slate-200 font-medium flex gap-3 items-center">
              <span>Turn:
                <span className={
                  'ml-1 px-2 py-0.5 rounded text-[12px] font-semibold ' +
                  (turnTeam === 'A' ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/40' :
                   turnTeam === 'B' ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/40' :
                   turnTeam === 'C' ? 'bg-green-500/20 text-green-300 ring-1 ring-green-400/40' :
                                     'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-400/40')
                }>{`Team ${turnTeam}`}</span>
                {game.turnOfUserId && currentUserId === game.turnOfUserId && !membershipDenied && (
                  <span className="ml-2 text-xs text-emerald-400 font-medium">Your turn</span>
                )}
              </span>
              {myTeam && (
                <span>Your Team:
                  <span className={
                    'ml-1 px-2 py-0.5 rounded text-[12px] font-semibold ' +
                    (myTeam === 'A' ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30' :
                     myTeam === 'B' ? 'bg-red-500/15 text-red-300 ring-1 ring-red-400/30' :
                     myTeam === 'C' ? 'bg-green-500/15 text-green-300 ring-1 ring-green-400/30' :
                                       'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-400/30')
                  }>{`Team ${myTeam}`}</span>
                </span>
              )}
              {localMode && <span className="text-xs text-slate-400">(Local)</span>}
            </div>
          </div>
        )}
        {loading && !game && (
          <div className="animate-pulse text-sm text-gray-300">Creating game...</div>
        )}
        {error && !game && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={createGame} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400">Retry Lobby</button>
          </div>
        )}
        {membershipDenied && (
          <div className="p-4 rounded bg-indigo-900/40 border border-indigo-500 text-sm max-w-md text-center">
            Spectator Mode – you are not a registered player in this game (view only).
          </div>
        )}
        {!membershipDenied && !game && !loading && !new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('g') && (
          <div className="w-full max-w-md space-y-4 p-4 rounded bg-slate-800/60 border border-slate-700">
            <h2 className="text-lg font-semibold">Start a Game</h2>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Local Players (2-4)</label>
              <input type="range" min={2} max={4} value={localPlayerCount} onChange={e=> setLocalPlayerCount(Number(e.target.value))} className="w-full" />
              <div className="text-xs text-slate-400">{localPlayerCount} Player{localPlayerCount>1?'s':''}</div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => {
                const g = createLocalGame(localPlayerCount);
                setGame({ boardCategories: g.boardCategories, pieces: g.pieces, blackHoles: g.blackHoles });
                setPersisted(false);
                setTurnTeam('A');
                setLocalMode(true);
              }} className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium shadow hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400">Play Locally</button>
              <button onClick={createGame} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400">Create Lobby</button>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">Local mode: all players share this device. Lobby mode attempts persistence and remote opponent matching.</p>
          </div>
        )}
        {game && (
          <div className="flex flex-col items-center gap-3">
            {playerInfo ? (
              <div className="flex flex-wrap justify-center gap-2 text-[11px] text-slate-300">
                {game.players?.map(p => {
                  const info = playerInfo[p.userId];
                  const label = info?.name || info?.email?.split('@')[0] || p.userId;
                  return (
                    <div key={p.userId} className={'flex items-center gap-2 px-2 py-1 rounded border bg-slate-700/40 ' + (p.userId===game.turnOfUserId ? 'border-indigo-400' : 'border-slate-600')}>
                      <Avatar name={info?.name} email={info?.email} size={28} />
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium text-[11px]">{label} <span className="text-xs text-slate-400">({info?.elo ?? '?'})</span></span>
                        <span className="text-[10px] text-slate-500">Team {p.team}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {Array.from({ length: game.players?.length || 0 }).map((_,i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded border border-slate-600 bg-slate-700/30 animate-pulse">
                    <div className="w-7 h-7 rounded-full bg-slate-600" />
                    <div className="flex flex-col gap-1">
                      <div className="h-2 w-20 bg-slate-600 rounded" />
                      <div className="h-2 w-10 bg-slate-700 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!gameChannelReady && !localMode && (
              <div className="text-[11px] text-slate-400 animate-pulse">Connecting realtime...</div>
            )}
            {!persisted && (
              <div className="text-xs text-amber-400">Ephemeral game (DB offline) – progress won&apos;t persist.</div>
            )}
            <div className="scale-[0.9] sm:scale-100 md:scale-[1.1] lg:scale-[1.2] transition-transform">
              <Board
                categories={game.boardCategories}
                pieces={game.pieces}
                blackHoles={game.blackHoles}
                selected={selected}
                onSelect={(x,y)=> setSelected({x,y})}
                activeTeam={turnTeam}
                controllableTeam={membershipDenied ? null : myTeam}
                lastMovedPieceId={lastMovedPieceId}
                events={recentEvents}
                interactive={!membershipDenied}
                onRequestMove={async ({ pieceId, toX, toY, category }) => {
                  if (membershipDenied) return; // spectators cannot move
                  // prevent move attempts if game not yet persisted in DB
                  if (!localMode && persisted !== true) {
                    setToast({ id: ++toastCounter.current, type: 'error', message: 'Game not yet created in lobby - please wait.' });
                    return;
                  }
                  // Enforce ownership & active turn before fetching a question (remote)
                  if (game.turnOfUserId) {
                    const userId = localStorage.getItem('userId');
                    if (userId !== game.turnOfUserId) {
                      setToast({ id: ++toastCounter.current, type: 'error', message: 'Not your turn' });
                      return;
                    }
                  }
                  if (myTeam) {
                    const piece = game.pieces.find(p => p.id === pieceId);
                    if (piece && piece.team !== myTeam) {
                      setToast({ id: ++toastCounter.current, type: 'error', message: 'You cannot move that piece' });
                      return;
                    }
                  }
                  if (questionOpen || questionLoading) return; // prevent overlapping
                  // If the square category is 'Random', choose a random real category (excluding 'Random') now.
                  let effectiveCategory = category;
                  if (category === 'Random') {
                    // We'll import categories dynamically to avoid stale values.
                    // Since this is client-side, we can hardcode a synced list or pull from game.boardCategories flatten.
                    const uniqueCats = Array.from(new Set(game?.boardCategories.flat() || []));
                    const filtered = uniqueCats.filter(c => c !== 'Random');
                    if (filtered.length) {
                      effectiveCategory = filtered[Math.floor(Math.random() * filtered.length)];
                    }
                  }
                  setPendingMove({ pieceId, toX, toY, category: effectiveCategory });
                  setQuestionLoading(true);
                  try {
                    const qRes = await fetch(`/api/questions?category=${encodeURIComponent(effectiveCategory)}`);
                    const qData = await qRes.json();
                    if (!qRes.ok || !qData.question) {
                      // No question available; just apply move (treat as free move)
                      applyPendingMove(!localMode && !!game._id);
                      return;
                    }
                    // For remote games we must first register pending BEFORE showing modal to avoid race with answering quickly.
                    if (!localMode && game._id) {
                      // secondary guard before pending
                      if (persisted !== true) return;
                     const userId = localStorage.getItem('userId');
                     const pendingRes = await fetch(`/api/games/${game._id}/pending`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, pieceId, toX, toY, category: effectiveCategory, questionId: qData.question._id })
                      });
                      if (!pendingRes.ok) {
                        const perr = await pendingRes.json().catch(()=>({}));
                        let msg = 'Pending failed';
                        switch (perr.error) {
                          case 'ALREADY_PENDING': msg = 'Already have a pending question.'; break;
                          case 'NOT_YOUR_TURN': msg = 'Turn changed before move.'; break;
                          case 'CATEGORY_MISMATCH': msg = 'Category mismatch – reselect square.'; break;
                          case 'RATE_LIMIT': msg = 'Too fast – slow down.'; break;
                          default: break;
                        }
                        setToast({ id: ++toastCounter.current, type: 'error', message: msg });
                        setPendingMove(null);
                        setSelected(null);
                        return;
                      }
                    }
                    setQuestion({ id: qData.question._id, text: qData.question.text, choices: qData.question.choices });
                    setQuestionOpen(true);
                  } catch (e) {
                    console.error('Fetch/register question failed', e);
                    applyPendingMove(!localMode && !!game._id);
                  } finally {
                    setQuestionLoading(false);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className={
            `px-4 py-2 rounded-md shadow-lg text-sm font-medium backdrop-blur border ${toast.type === 'success' ? 'bg-emerald-600/80 border-emerald-400 text-white' : 'bg-rose-600/80 border-rose-400 text-white'} animate-fade-in`
          }>
            {toast.message}
          </div>
        </div>
      )}
      {gameOver && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="px-6 py-3 rounded-lg bg-indigo-700/80 border border-indigo-400 text-white shadow-xl backdrop-blur text-sm font-semibold animate-fade-in">
            Game Over – Team {gameOver.winner} wins ({gameOver.reason}).
          </div>
        </div>
      )}
      <QuestionModal
        open={questionOpen}
        question={question ? { text: question.text, choices: question.choices } : null}
        onAnswer={async (idx) => {
          const qid = question?.id;
          let correct = false;
          if (!localMode && game?._id && pendingMove && qid) {
            try {
              const userId = localStorage.getItem('userId');
              const { pieceId, toX, toY } = pendingMove;
              // perform attempt, retry once if 404
              const gid = game!._id; // non-null asserted
              async function doAttempt() {
                return fetch(`/api/games/${gid}/attempt`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId, pieceId, toX, toY, questionId: qid, answerIndex: idx })
                });
              }
              let res = await doAttempt();
              if (res.status === 404) {
                // possible replication lag or late persistence: re-fetch game
                const reload = await fetch(`/api/games/${gid}`);
                if (reload.ok) {
                  res = await doAttempt();
                }
              }
              const data = await res.json().catch(()=>({}));
              if (res.ok) {
                correct = !!data.correct;
                if (data.error === 'NO_PENDING') {
                  setToast({ id: ++toastCounter.current, type: 'error', message: 'Move expired – reselect piece.' });
                } else if (correct) {
                  setToast({ id: ++toastCounter.current, type: 'success', message: 'Correct! Move applied.' });
                } else {
                  setToast({ id: ++toastCounter.current, type: 'error', message: 'Incorrect – Turn Lost.' });
                }
              } else {
                const err = data.error;
                let msg = err || 'Move failed';
                switch (err) {
                  case 'NOT_YOUR_TURN': msg = 'Not your turn.'; break;
                  case 'NO_PENDING': msg = 'No pending move – retry.'; break;
                  case 'MISMATCH_PENDING': msg = 'Move changed – retry.'; break;
                  case 'PENDING_EXPIRED': msg = 'Question expired – reselect piece.'; break;
                  case 'CATEGORY_MISMATCH': msg = 'Category mismatch.'; break;
                  case 'NOT_FOUND': msg = 'Game not found (maybe not persisted).'; break;
                  default: break;
                }
                setToast({ id: ++toastCounter.current, type: 'error', message: msg });
              }
            } catch (e) {
              console.warn('Attempt failed', e);
              setToast({ id: ++toastCounter.current, type: 'error', message: 'Network error – try again.' });
            }
          } else if (qid) {
            // Local mode correctness check via questions/check
            try {
              const res = await fetch('/api/questions/check', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: qid, answerIndex: idx })
              });
              const data = await res.json();
              correct = !!data.correct;
            } catch {
              correct = false;
            }
            if (correct) {
              applyPendingMove(false);
              setToast({ id: ++toastCounter.current, type: 'success', message: 'Correct! Move applied.' });
            } else {
              setToast({ id: ++toastCounter.current, type: 'error', message: 'Incorrect – Turn Lost.' });
              setPendingMove(null);
              setSelected(null);
            }
          }

          setQuestionHistory(h => [...h, { qid, correct, category: pendingMove?.category || '' }]);
          setQuestionOpen(false);
          setQuestion(null);
          // Auto clear recent events after animations (~1.3s)
          setTimeout(() => setRecentEvents(null), 1400);
          // Auto-hide toast
          setTimeout(() => {
            setToast(cur => (cur && cur.id === toastCounter.current ? null : cur));
          }, 2800);
        }}
        onClose={() => { setQuestionOpen(false); setPendingMove(null); }}
      />
      {game && !membershipDenied && currentUserId && game.turnOfUserId === currentUserId && (
        <div className="fixed top-2 left-2 z-40 select-none">
          <div className={
            'px-3 py-1 rounded-md text-[11px] font-semibold shadow ring-1 backdrop-blur ' +
            (myTeam === 'A' ? 'bg-blue-600/30 ring-blue-400/40 text-blue-100' :
             myTeam === 'B' ? 'bg-red-600/30 ring-red-400/40 text-red-100' :
             myTeam === 'C' ? 'bg-green-600/30 ring-green-400/40 text-green-100' :
                              'bg-yellow-600/30 ring-yellow-400/40 text-yellow-100')
          }>
            Your Turn
          </div>
          {questionHistory.length > 0 && (
            <div className="fixed bottom-4 right-4 w-48 max-h-56 overflow-auto text-[11px] bg-slate-800/70 border border-slate-600 rounded p-2 backdrop-blur shadow">
              <div className="font-semibold text-slate-300 mb-1">Questions</div>
              <ul className="space-y-1">
                {questionHistory.slice(-12).reverse().map((q,i) => (
                  <li key={i} className={`flex justify-between items-center px-1 py-0.5 rounded ${q.correct ? 'bg-emerald-600/20 text-emerald-300' : 'bg-rose-600/20 text-rose-300'}`}>
                    <span className="truncate max-w-[90px]" title={q.category}>{q.category}</span>
                    <span>{q.correct ? '✔' : '✖'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
