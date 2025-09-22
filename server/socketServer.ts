import { Server } from 'socket.io';
import { createServer } from 'http';
import type { Game } from '@/models/types';
import { createNewGame } from '@/lib/board';

// In-memory lobby & game store (MVP). Replace with persistent storage later.
interface Lobby {
  id: string;
  hostSocketId: string;
  maxPlayers: number; // 2..4
  players: { socketId: string; team: string; userId: string }[]; // sequential teams A,B,C,D
  createdAt: number;
  started: boolean;
  game?: Game;
}

const lobbies = new Map<string, Lobby>();

function generateId() { return Math.random().toString(36).slice(2, 10); }

export function attachSocketServer(nextServer: any) {
  // Reuse existing HTTP server if provided (Next.js custom server mode) else create one.
  const httpServer = nextServer?.httpServer || createServer();
  const io = new Server(httpServer, { cors: { origin: '*'}});

  io.on('connection', (socket) => {
    // Create lobby
    socket.on('lobby:create', (payload: { maxPlayers?: number }, cb: (resp: any) => void) => {
      const maxPlayers = Math.min(4, Math.max(2, payload?.maxPlayers || 2));
      const lobbyId = generateId();
      const lobby: Lobby = {
        id: lobbyId,
        hostSocketId: socket.id,
        maxPlayers,
        players: [{ socketId: socket.id, team: 'A', userId: `guest-${lobbyId}-1` }],
        createdAt: Date.now(),
        started: false,
      };
      lobbies.set(lobbyId, lobby);
      socket.join(lobbyId);
      cb?.({ ok: true, lobby });
      io.to(lobbyId).emit('lobby:update', lobby);
    });

    // Join lobby via id
    socket.on('lobby:join', (payload: { lobbyId: string }, cb: (resp: any) => void) => {
      const lobby = lobbies.get(payload.lobbyId);
      if (!lobby) return cb?.({ ok: false, error: 'NOT_FOUND' });
      if (lobby.started) return cb?.({ ok: false, error: 'ALREADY_STARTED' });
      if (lobby.players.find(p => p.socketId === socket.id)) return cb?.({ ok: true, lobby });
      if (lobby.players.length >= lobby.maxPlayers) return cb?.({ ok: false, error: 'FULL' });
      const teamOrder = ['A','B','C','D'];
      const team = teamOrder[lobby.players.length];
      const player = { socketId: socket.id, team, userId: `guest-${lobby.id}-${lobby.players.length+1}` };
      lobby.players.push(player);
      socket.join(lobby.id);
      cb?.({ ok: true, lobby });
      io.to(lobby.id).emit('lobby:update', lobby);
    });

    // Start game (host only)
    socket.on('lobby:start', (payload: { lobbyId: string }, cb: (resp: any) => void) => {
      const lobby = lobbies.get(payload.lobbyId);
      if (!lobby) return cb?.({ ok: false, error: 'NOT_FOUND' });
      if (lobby.hostSocketId !== socket.id) return cb?.({ ok: false, error: 'NOT_HOST' });
      if (lobby.started) return cb?.({ ok: true, lobby });
      lobby.started = true;
      // Build game with number of players present
      const game = createNewGame({ creatorUserId: lobby.players[0].userId, playerCount: lobby.players.length });
      // Inject real user mapping (socket based) into game.players
      game.players = lobby.players.map(p => ({ userId: p.userId, team: p.team as any }));
      lobby.game = game;
      cb?.({ ok: true, game });
      io.to(lobby.id).emit('lobby:started', { lobbyId: lobby.id, game });
    });

    // Leave / disconnect logic
    function handleLeave() {
      for (const lobby of lobbies.values()) {
        const idx = lobby.players.findIndex(p => p.socketId === socket.id);
        if (idx !== -1) {
          lobby.players.splice(idx, 1);
          // If host left or no players, destroy lobby
          if (lobby.players.length === 0 || lobby.hostSocketId === socket.id) {
            lobbies.delete(lobby.id);
            io.to(lobby.id).emit('lobby:closed');
          } else {
            io.to(lobby.id).emit('lobby:update', lobby);
          }
          break;
        }
      }
    }
    socket.on('disconnect', handleLeave);
    socket.on('lobby:leave', handleLeave);
  });

  return io;
}

// If this file is executed directly (optional standalone server)
if (require.main === module) {
  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: '*' }});
  attachSocketServer({ httpServer });
  const PORT = process.env.SOCKET_PORT || 4001;
  httpServer.listen(PORT, () => console.log(`[socket] listening on :${PORT}`));
}
