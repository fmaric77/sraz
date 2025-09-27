"use client";
import React, { useEffect, useState, useRef } from 'react';
import Board from './components/Board';
import CategoryLegend from './components/CategoryLegend';
import QuestionModal from './components/QuestionModal';
import { Piece, Team, Game as FullGame } from '@/models/types';
import { Avatar } from '@/app/components/Avatar';
import { fetchPublicUsers } from '@/lib/userPublicCache';
import { createLocalGame } from '@/lib/board';
import { resolveCombatAndMove, CombatEvent, ResolveResult } from '@/lib/combat';
import { useTranslation } from '@/app/components/TranslationProvider';
import { useCurrentUser } from '@/app/components/CurrentUserProvider';

interface GameStateLite {
  _id?: string;
  boardCategories: string[][];
  pieces: Piece[];
  blackHoles?: { x: number; y: number }[];
  players?: { userId: string; team: Team }[];
  turnOfUserId?: string;
}

export default function GamePage() {
  const { language: ctxLanguage } = useCurrentUser();
  const { t } = useTranslation();
  const [game, setGame] = useState<GameStateLite | null>(null);
  const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<{x:number;y:number}|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [turnTeam, setTurnTeam] = useState<Team>('A');
  const [localPlayerCount, setLocalPlayerCount] = useState(2);
  const [gameChannelReady, setGameChannelReady] = useState(false);
  const [membershipDenied, setMembershipDenied] = useState(false);
  interface GameAblyMessage { name: string; data: unknown }
  interface AblyPresenceLike { subscribe: (event: string, listener: (msg: { clientId?: string }) => void) => void; get: (cb: (err: unknown, members: { clientId?: string }[] | null) => void) => void; enter: (data: unknown) => void; unsubscribe?: () => void }
  interface GameAblyChannel { subscribe: (args: unknown, listener?: (msg: GameAblyMessage) => void) => void; presence: AblyPresenceLike; unsubscribe?: () => void }
  interface GameAblyClient { channels: { get: (name: string) => GameAblyChannel }; close?: () => void }
  const ablyClientRef = useRef<GameAblyClient | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ pieceId: string; toX: number; toY: number; category: string } | null>(null);
  // question.order maps displayed index -> original index from DB so shuffling on client doesn't break correctness mapping
  const [question, setQuestion] = useState<{ id?: string; text: string; choices: string[]; order?: number[] } | null>(null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionDeadline, setQuestionDeadline] = useState<number | null>(null); // epoch ms when current question expires

  // Countdown + auto-timeout logic: if deadline passes without answer, treat as incorrect answer / lose turn
  const [, forceRerender] = useState(0); // internal counter to force re-render for timer display
  useEffect(() => {
    if (!questionOpen || !questionDeadline) return;
    const id = setInterval(() => {
      if (!questionDeadline) return;
      if (Date.now() >= questionDeadline) {
        clearInterval(id);
        // Simulate incorrect answer path
        const qid = question?.id;
        if (!qid) {
          setQuestionOpen(false); setQuestion(null); setQuestionDeadline(null); setPendingMove(null); setSelected(null); return;
        }
        // Remote mode: we need to signal attempt with an invalid answer (e.g., -1) OR just expire locally and rely on turn change? We'll attempt with -1 expecting incorrect.
        (async () => {
          if (!localMode && game?._id && pendingMove) {
            try {
              const userId = localStorage.getItem('userId');
              const { pieceId, toX, toY } = pendingMove;
              await fetch(`/api/games/${game._id}/attempt`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, pieceId, toX, toY, questionId: qid, answerIndex: -1 })
              });
              // Toast will appear from turn event handler; fallback toast here:
              setToast(t => t || { id: ++toastCounter.current, type: 'error', message: translatedTexts['Time up – Turn Lost.'] || 'Time up – Turn Lost.' });
            } catch {
              setToast({ id: ++toastCounter.current, type: 'error', message: translatedTexts['Time up – Turn Lost.'] || 'Time up – Turn Lost.' });
            }
          } else {
            // Local mode: just mark incorrect and advance
            setToast({ id: ++toastCounter.current, type: 'error', message: translatedTexts['Time up – Turn Lost.'] || 'Time up – Turn Lost.' });
            setPendingMove(null);
            setSelected(null);
          }
          setQuestionHistory(h => [...h, { qid, correct: false, category: pendingMove?.category || '' }]);
          setQuestionOpen(false);
          setQuestion(null);
          setQuestionDeadline(null);
        })();
      } else {
        // Force re-render for remainingMs display
        forceRerender(n => n + 1);
      }
    }, 200);
    return () => clearInterval(id);
  }, [questionOpen, questionDeadline, localMode, game?._id, pendingMove, question?.id]);

  // Removed explicit tick state (unused) – using forceRerender instead.
  const [toast, setToast] = useState<{ id: number; type: 'success' | 'error'; message: string } | null>(null);
  const [lastMovedPieceId, setLastMovedPieceId] = useState<string | null>(null);
  const [questionHistory, setQuestionHistory] = useState<{ qid?: string; correct: boolean; category: string }[]>([]);
  const [recentEvents, setRecentEvents] = useState<CombatEvent[] | null>(null);
  const [gameOver, setGameOver] = useState<{ winner: 'A' | 'B'; reason: string } | null>(null);
  const [disconnectTimersRef] = useState<{ map: Map<string, ReturnType<typeof setTimeout>> }>({ map: new Map() });
  const toastCounter = React.useRef(0);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [playerInfo, setPlayerInfo] = useState<Record<string, { email: string; elo: number; name?: string }> | null>(null);
  const [disconnectCountdowns, setDisconnectCountdowns] = useState<Record<string, number>>({}); // userId -> ms remaining
  // Audio (piece move sound)
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);

  // Initialize move sound once on client
  useEffect(() => {
    // Guard: Only create after hydration
    try {
      const audio = new Audio('/sound/1.wav');
      audio.preload = 'auto';
      audio.volume = 0.6; // moderate volume
      moveSoundRef.current = audio;
    } catch {
      // ignore – audio unsupported
    }
  }, []);

  function playMoveSound() {
    const a = moveSoundRef.current;
    if (!a) return;
    try {
      a.currentTime = 0; // restart for rapid moves
      const playPromise = a.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => { /* autoplay might be blocked until user gesture */ });
      }
    } catch {
      // swallow
    }
  }

  // Typed helper to safely coerce unknown realtime payloads for 'game.turn' events
  interface GameTurnPayload { nextTurnUserId?: string; incorrect?: boolean }
  const asTurnPayload = React.useCallback((d: unknown): GameTurnPayload => {
    if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      return {
        nextTurnUserId: typeof o.nextTurnUserId === 'string' ? o.nextTurnUserId : undefined,
        incorrect: o.incorrect === true,
      };
    }
    return {};
  }, []);

  // Load translated texts when language changes
  useEffect(() => {
    const loadTranslations = async () => {
      if (!ctxLanguage || ctxLanguage === 'en') {
        setTranslatedTexts({});
        return;
      }

      const textsToTranslate = [
        'Turn',
        'Team',
        'Your turn',
        'Your Team',
        'Local',
        'Players',
        'Field Legend',
        'Question',
        'Correct! Move applied.',
        'Incorrect – Turn Lost.',
        'Time up – Turn Lost.',
        'Move rejected',
        'Network error',
        'Not your turn',
        'You cannot move that piece',
        'Game not yet created in lobby - please wait.',
        'Move resolved.',
        'Promotion: Level',
        'Enemy piece destroyed',
        'Enemy demoted to level',
        'Game Over',
        'wins',
        'all pieces eliminated',
        'game finished',
        'Spectator Mode – you are not a registered player in this game (view only).',
        'Creating game...',
        'Retry Lobby',
        'Play Locally',
        'Create Lobby',
        'Local mode: all players share this device. Lobby mode attempts persistence and remote opponent matching.',
        'Local Players (2-4)',
        'Player',
        'Players',
        'Connecting realtime...',
        'Ephemeral game – progress won\'t persist.',
        'Disconnected',
        's',
        'reconnected.',
        'removed.',
        'Player disconnected – 30s to return.'
      ];

      const translations: Record<string, string> = {};
      for (const text of textsToTranslate) {
        translations[text] = await t(text);
      }
      setTranslatedTexts(translations);
    };

    loadTranslations();
  }, [ctxLanguage, t]);

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
  let gid = params.get('g');
  const accessToken = params.get('accessToken');
    // Fallback: support /game/{id} path pattern in addition to /game?g={id}
    // This allows external redirects or future navigation changes without breaking the loader.
    if (!gid) {
      try {
        const parts = window.location.pathname.split('/');
        // Expect ['', 'game', '{id}'] minimal length 3
        if (parts.length >= 3 && parts[1] === 'game' && parts[2]) {
          gid = parts[2];
        }
      } catch {
        // ignore parsing errors
      }
    }
    if (!gid) return; // stay idle for local/creation options
    (async () => {
      setLoading(true); setError(null);
      try {
  const res = await fetch(`/api/games/${gid}${accessToken ? `?accessToken=${encodeURIComponent(accessToken)}` : ''}`);
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
      } catch (err: unknown) {
        const msg = typeof err === 'object' && err && 'message' in err ? (err as { message?: string }).message : 'Failed loading game';
        setError(msg || 'Failed loading game');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Subscribe to realtime move events when remote game id present (stable subscription)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
  let gid = params.get('g');
  const accessToken = params.get('accessToken');
    if (!gid) {
      try {
        const parts = window.location.pathname.split('/');
        if (parts.length >= 3 && parts[1] === 'game' && parts[2]) gid = parts[2];
      } catch {}
    }
    if (!gid) return; // local mode: skip
    if (!game?._id || game._id !== gid) return; // wait until correct game loaded
  let channel: GameAblyChannel | null = null; // realtime channel reference
  let client: GameAblyClient | null = null; // realtime client reference
  // Presence disconnect tracking
  const disconnectTimers = disconnectTimersRef.map;
  const GRACE_MS = 30_000;
  async function attemptPrune(targetUserId: string) {
    try {
      const me = localStorage.getItem('userId');
      if (!me) return;
      await fetch(`/api/games/${gid}/prune`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me, targetUserId }) });
    } catch (e) { console.warn('prune failed', e); }
  }
  function isDeterministicLeader(presentIds: string[]): boolean {
    const me = localStorage.getItem('userId');
    if (!me) return false;
    const sorted = [...presentIds].sort();
    return sorted[0] === me;
  }
  interface AblyEnvelope { type: string; data: unknown; ts: number }
  interface GameMovePayload { pieces?: Piece[]; nextTurnUserId?: string; players?: { userId: string; team: Team }[]; eliminatedTeam?: Team }
    let mounted = true;
    (async () => {
      try {
  const uidParam = (()=>{ try { return localStorage.getItem('userId'); } catch { return null; } })();
  const tokenRes = await fetch(`/api/realtime/token${uidParam ? `?userId=${encodeURIComponent(uidParam)}` : ''}`);
        if (!tokenRes.ok) return;
  const { Realtime } = await import('ably');
  client = new (Realtime as unknown as { new(options: unknown): GameAblyClient })({ authUrl: `/api/realtime/token${uidParam ? `?userId=${encodeURIComponent(uidParam)}` : ''}` });
    ablyClientRef.current = client as GameAblyClient;
  if (!client) throw new Error('Realtime client not initialized');
  channel = client.channels.get(`game-${gid}`);
  // Enter presence with stable userId (derive from localStorage or turn membership check earlier)
  try {
    const storedId = localStorage.getItem('userId');
    if (storedId && channel && channel.presence) {
      channel.presence.enter({ t: Date.now() });
    }
  } catch {}
  // Subscribe to presence events for disconnect tracking
  try {
    channel.presence.subscribe('leave', (msg) => {
      const leftId = msg?.clientId;
      if (!leftId) return;
      // Start grace timer only if player is part of game roster
      if (!game?.players?.some(p=>p.userId===leftId)) return;
      if (disconnectTimers.has(leftId)) return; // already pending
      const start = Date.now();
      function tick() {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, GRACE_MS - elapsed);
  setDisconnectCountdowns(dc => leftId ? ({ ...dc, [leftId as string]: remaining }) : dc);
        if (remaining <= 0) return; else setTimeout(tick, 500);
      }
      tick();
      const timer = setTimeout(async () => {
        disconnectTimers.delete(leftId);
        setDisconnectCountdowns(dc => { const n = { ...dc }; delete n[leftId]; return n; });
        // Confirm they have not re-entered by checking current presence list
        channel?.presence.get((err: unknown, members: { clientId?: string }[] | null) => {
          if (err) return;
          const presentIds = (members || []).map((m)=> m.clientId).filter((id): id is string => !!id);
          if (presentIds.includes(leftId)) return; // they came back
          // Only deterministic leader triggers prune to avoid duplicate calls
          if (isDeterministicLeader(presentIds)) {
            attemptPrune(leftId);
          }
        });
      }, GRACE_MS);
      disconnectTimers.set(leftId, timer);
      setToast({ id: ++toastCounter.current, type: 'error', message: `Player ${leftId.slice(0,6)} disconnected – 30s to return.` });
    });
    channel.presence.subscribe('enter', (msg) => {
      const reId = msg?.clientId;
      if (!reId) return;
      const t = disconnectTimers.get(reId);
      if (t) {
        clearTimeout(t);
        disconnectTimers.delete(reId);
        setDisconnectCountdowns(dc => { const n = { ...dc }; delete n[reId]; return n; });
        setToast({ id: ++toastCounter.current, type: 'success', message: `Player ${reId.slice(0,6)} reconnected.` });
      }
    });
  } catch {}
  channel.subscribe((msg: GameAblyMessage) => {
          if (!mounted) return;
          if (msg.name === 'game.move') {
            const envelope = msg.data as AblyEnvelope | GameMovePayload;
            const payload: GameMovePayload = ((): GameMovePayload => {
              if (envelope && typeof envelope === 'object' && 'data' in (envelope as AblyEnvelope) && typeof (envelope as AblyEnvelope).data === 'object') {
                return (envelope as AblyEnvelope).data as GameMovePayload;
              }
              return envelope as GameMovePayload;
            })();
            // Player pruned toast variant (narrow unknown shape)
            if (payload && (payload as unknown) && typeof payload === 'object') {
              const maybe = payload as Record<string, unknown>;
              if (maybe.type === 'player.pruned' && typeof maybe.prunedUserId === 'string') {
                const prunedUserId = maybe.prunedUserId;
                setToast({ id: ++toastCounter.current, type: 'error', message: `Player ${prunedUserId.slice(0,6)} removed.` });
              }
            }
            if (payload?.pieces) {
              setGame(g => {
                if (!g) return g;
                const nextPlayers = payload.players && Array.isArray(payload.players) ? payload.players : g.players || [];
                const validTeams = new Set((nextPlayers||[]).map(p=>p.team));
                const sanitized = (payload.pieces || []).filter((p)=> validTeams.has(p.team));
                if (sanitized.length !== (payload.pieces || []).length) {
                  console.warn('Sanitized extraneous team pieces from realtime payload');
                }
                return { ...g, pieces: sanitized, players: nextPlayers, turnOfUserId: payload.nextTurnUserId || g.turnOfUserId };
              });
              // Play move sound for any received move update
              playMoveSound();
              // If players list changed, update local membership state
              if (payload.players && currentUserId) {
                const stillMember = payload.players.some(p => p.userId === currentUserId);
                if (!stillMember) setMembershipDenied(true);
                else setMembershipDenied(false);
                const me = payload.players.find(p => p.userId === currentUserId);
                if (me) setMyTeam(me.team);
              }
              if (payload?.nextTurnUserId && game?.players) {
                const nextPlayer = game.players.find(p => p.userId === payload.nextTurnUserId);
                if (nextPlayer) setTurnTeam(nextPlayer.team);
              }
            } else {
              fetch(`/api/games/${gid}${accessToken ? `?accessToken=${encodeURIComponent(accessToken)}` : ''}`)
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
            // Use stats directly from payload
            const envelope = msg.data as { data?: { stats?: unknown[]; pieces?: Piece[]; winnerTeam?: Team } };
            const stats = envelope?.data?.stats || [];
            const pieces = envelope?.data?.pieces;
            const winnerTeam = envelope?.data?.winnerTeam;
            if (pieces && game) {
              setGame(g => g ? { ...g, pieces, status: 'finished' as const } : g);
            }
            if (winnerTeam) {
              setGameOver({ winner: winnerTeam as 'A' | 'B', reason: 'game finished' });
            }
            try {
              const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ g: gid, stats }))));
              setTimeout(() => { window.location.href = `/?stats=${payload}`; }, 1200);
            } catch {}
          }
        });
        setGameChannelReady(true);
      } catch (err: unknown) {
        console.warn('Realtime subscribe failed', err);
      }
    })();
    return () => {
      mounted = false;
      try {
        // Clean grace timers
        disconnectTimers.forEach(t => clearTimeout(t));
        disconnectTimers.clear();
      } catch {}
      try { channel && channel.presence && channel.presence.unsubscribe && channel.presence.unsubscribe(); } catch {}
      try { channel?.unsubscribe?.(); } catch {}
      try { client?.close?.(); } catch {}
  } 
  // Effect intentionally excludes rapidly changing objects (disconnectCountdowns) and stable refs (disconnectTimersRef)
  // Dependencies: game?._id triggers re-subscribe when game changes; asTurnPayload stable via useCallback
  }, [game?._id, asTurnPayload, currentUserId, disconnectTimersRef.map, game]);

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
    } catch (err: unknown) {
      console.error(err);
      function isAbortError(v: unknown): v is { name: string } {
        return !!v && typeof v === 'object' && 'name' in v && (v as { name?: unknown }).name === 'AbortError';
      }
      function hasMessage(v: unknown): v is { message: string } {
        return !!v && typeof v === 'object' && 'message' in v && typeof (v as { message?: unknown }).message === 'string';
      }
      let message = 'Unknown error';
      if (isAbortError(err)) message = 'Request timed out.';
      else if (hasMessage(err)) message = err.message;
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
        else {
          // Remote move accepted: play sound now (will also arrive via realtime, but play immediately for snappier UX)
          playMoveSound();
        }
      } catch {
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
    // Local mode: play sound immediately after applying local move
    playMoveSound();
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
  <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-6 lg:p-8 relative game-bg overflow-hidden">
      {/* Ambient orbs */}
      <div className="bg-orb-container">
        <div className="bg-orb" style={{ top: '-120px', left: '-150px', background: 'radial-gradient(circle at 30% 30%, rgba(34,211,238,0.55), transparent 70%)' }} />
        <div className="bg-orb alt" style={{ bottom: '-160px', right: '-140px', background: 'radial-gradient(circle at 65% 65%, rgba(147,51,234,0.5), transparent 70%)' }} />
        <div className="bg-orb" style={{ bottom: '10%', left: '5%', background: 'radial-gradient(circle at 45% 45%, rgba(16,185,129,0.45), transparent 70%)', width: '360px', height: '360px' }} />
      </div>
      <div className="w-full max-w-7xl flex flex-col items-center gap-5 relative z-10">
        {game && (
          <div className="flex flex-col items-center gap-1">
            <div className="text-sm text-slate-200 font-medium flex gap-3 items-center">
              <span>{translatedTexts['Turn'] || 'Turn'}:
                <span className={
                  'ml-1 px-2 py-0.5 rounded text-[12px] font-semibold ' +
                  (turnTeam === 'A' ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/40' :
                   turnTeam === 'B' ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/40' :
                   turnTeam === 'C' ? 'bg-green-500/20 text-green-300 ring-1 ring-green-400/40' :
                                     'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-400/40')
                }>{`${translatedTexts['Team'] || 'Team'} ${turnTeam}`}</span>
                {game.turnOfUserId && currentUserId === game.turnOfUserId && !membershipDenied && (
                  <span className="ml-2 text-xs text-emerald-400 font-medium">{translatedTexts['Your turn'] || 'Your turn'}</span>
                )}
              </span>
              {myTeam && (
                <span>{translatedTexts['Your Team'] || 'Your Team'}:
                  <span className={
                    'ml-1 px-2 py-0.5 rounded text-[12px] font-semibold ' +
                    (myTeam === 'A' ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30' :
                     myTeam === 'B' ? 'bg-red-500/15 text-red-300 ring-1 ring-red-400/30' :
                     myTeam === 'C' ? 'bg-green-500/15 text-green-300 ring-1 ring-green-400/30' :
                                       'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-400/30')
                  }>{`${translatedTexts['Team'] || 'Team'} ${myTeam}`}</span>
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
              <label className="block text-sm font-medium text-slate-300">{translatedTexts['Local Players (2-4)'] || 'Local Players (2-4)'}</label>
              <input type="range" min={2} max={4} value={localPlayerCount} onChange={e=> setLocalPlayerCount(Number(e.target.value))} className="w-full" />
              <div className="text-xs text-slate-400">{localPlayerCount} {(translatedTexts['Player'] || 'Player')}{localPlayerCount>1?'s':''}</div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => {
                const g = createLocalGame(localPlayerCount);
                setGame({ boardCategories: g.boardCategories, pieces: g.pieces, blackHoles: g.blackHoles });
                setPersisted(false);
                setTurnTeam('A');
                setLocalMode(true);
              }} className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium shadow hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400">{translatedTexts['Play Locally'] || 'Play Locally'}</button>
              <button onClick={createGame} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400">{translatedTexts['Create Lobby'] || 'Create Lobby'}</button>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">{translatedTexts['Local mode: all players share this device. Lobby mode attempts persistence and remote opponent matching.'] || 'Local mode: all players share this device. Lobby mode attempts persistence and remote opponent matching.'}</p>
          </div>
        )}
        {game && (
          <div className="flex flex-col items-center gap-4 w-full fade-in-up">
            <div className="hud-panel w-full max-w-3xl px-4 py-3 rounded-lg shadow relative overflow-hidden">
              <div className="panel-heading mb-2 flex items-center gap-2">
                <span className="tracking-wider">{translatedTexts['Players'] || 'Players'}</span>
                <div className="h-px flex-1 bg-gradient-to-r from-sky-500/30 via-emerald-400/20 to-fuchsia-500/30" />
              </div>
              {playerInfo ? (
                <div className="flex flex-wrap gap-2">
                  {game.players?.map(p => {
                    const info = playerInfo[p.userId];
                    const label = info?.name || info?.email?.split('@')[0] || p.userId;
                    const active = p.userId === game.turnOfUserId;
                    const dcMs = disconnectCountdowns[p.userId];
                    return (
                      <div key={p.userId} className={`flex items-center gap-2 pl-2 pr-3 py-1 rounded-lg border text-[11px] backdrop-blur-sm ${active ? 'border-sky-400/60 bg-sky-600/15 pulse-ring' : 'border-slate-600/60 bg-slate-700/30'} transition` }>
                        <Avatar name={info?.name} email={info?.email} size={30} />
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium text-[11px] text-slate-200">{label} <span className="text-[10px] text-slate-400">({info?.elo ?? '?'})</span></span>
                          <span className="text-[10px] text-slate-500">Team {p.team}</span>
                        </div>
                        {typeof dcMs === 'number' && (
                          <span className="ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600/30 text-rose-300 text-[10px] font-semibold tracking-wide animate-pulse">
                            <span>Disconnected</span>
                            <span>{Math.ceil(dcMs/1000)}s</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
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
                <div className="text-[11px] text-slate-400 mt-2 animate-pulse">Connecting realtime...</div>
              )}
              {!persisted && (
                <div className="text-[11px] text-amber-400 mt-2">Ephemeral game – progress won&apos;t persist.</div>
              )}
            </div>
              <div className="flex flex-col md:flex-row items-start justify-center gap-10 xl:gap-12 2xl:gap-16 w-full">
              <div className="panel-border-gradient board-shell w-full max-w-[520px] sm:max-w-[560px] md:max-w-[600px] lg:max-w-[640px] md:mr-4 xl:mr-6">
                <div className="board-frame">
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
                  interactive={!membershipDenied && !questionOpen}
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
                    // Randomize order of choices on client while preserving mapping to original indices for answer submission
                    const originalChoices: string[] = qData.question.choices || [];
                    const order = originalChoices.map((_, i) => i).sort(() => Math.random() - 0.5);
                    const shuffled = order.map(i => originalChoices[i]);
                    setQuestion({ id: qData.question._id, text: qData.question.text, choices: shuffled, order });
                    setQuestionOpen(true);
                    setQuestionDeadline(Date.now() + 20_000); // 20 second window
                  } catch (err) {
                    console.error('Fetch/register question failed', err);
                    applyPendingMove(!localMode && !!game._id);
                  } finally {
                    setQuestionLoading(false);
                  }
                    }}
                />
                </div>
              </div>
              <div className="w-full md:w-[230px] lg:w-[240px] xl:w-[250px] flex flex-col gap-4 md:mt-0 mt-4 self-start">
                <div className="hud-panel p-4 space-y-3 soft-scrollbars max-h-[calc(100vh-240px)] overflow-auto">
                  <div className="hud-panel-heading">{translatedTexts['Field Legend'] || 'Field Legend'}</div>
                  <div className="divider-gradient" />
                  <CategoryLegend vertical />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 fade-in-up">
          <div className={`toast-enhanced ${toast.type === 'success' ? 'success' : 'error'} px-5 py-2.5 rounded-lg text-sm font-medium text-slate-100 flex items-center gap-3` }>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${toast.type==='success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span>{toast.message}</span>
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
        remainingMs={questionDeadline ? Math.max(0, questionDeadline - Date.now()) : undefined}
        onAnswer={async (idx) => {
          // Map displayed index back to original index used by server/database
          const originalIdx = question?.order ? question.order[idx] : idx;
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
                  body: JSON.stringify({ userId, pieceId, toX, toY, questionId: qid, answerIndex: originalIdx })
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
            } catch (err) {
              console.warn('Attempt failed', err);
              setToast({ id: ++toastCounter.current, type: 'error', message: 'Network error – try again.' });
            }
          } else if (qid) {
            // Local mode correctness check via questions/check
            try {
              const res = await fetch('/api/questions/check', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: qid, answerIndex: originalIdx })
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
          setQuestionDeadline(null);
          // Auto clear recent events after animations (~1.3s)
          setTimeout(() => setRecentEvents(null), 1400);
          // Auto-hide toast
          setTimeout(() => {
            setToast(cur => (cur && cur.id === toastCounter.current ? null : cur));
          }, 2800);
        }}
      />
      {game && !membershipDenied && currentUserId && game.turnOfUserId === currentUserId && (
        <div className="fixed top-3 left-3 z-40 select-none">
          <div className={`floating-badge px-4 py-1.5 rounded-md text-[11px] font-semibold tracking-wide glow-on ${
            myTeam === 'A' ? 'text-blue-100' :
            myTeam === 'B' ? 'text-red-100' :
            myTeam === 'C' ? 'text-green-100' : 'text-yellow-100'}`}>Your Turn</div>
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
