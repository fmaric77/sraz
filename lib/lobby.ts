import { getCollection } from '@/lib/db';
import { Lobby, LobbyPlayerRef, Team } from '@/models/types';

function generateLobbyCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createLobby(hostUserId: string, maxPlayers: number = 2): Promise<Lobby> {
  const col = await getCollection<Lobby>('lobbies');
  maxPlayers = Math.min(4, Math.max(2, maxPlayers));
  const code = generateLobbyCode();
  const lobby: Lobby = {
    lobbyCode: code,
    hostUserId,
    maxPlayers,
    players: [{ userId: hostUserId, team: 'A', joinedAt: new Date() }],
    status: 'open',
    createdAt: new Date(),
  };
  await col.insertOne(lobby as Lobby);
  return lobby;
}

export async function getLobby(code: string): Promise<Lobby | null> {
  const col = await getCollection<Lobby>('lobbies');
  return col.findOne({ lobbyCode: code });
}

export async function joinLobby(code: string, userId: string): Promise<Lobby | { error: string }> {
  const col = await getCollection<Lobby>('lobbies');
  const lobby = await col.findOne({ lobbyCode: code });
  if (!lobby) return { error: 'NOT_FOUND' };
  if (lobby.status !== 'open') return { error: 'NOT_OPEN' };
  if (lobby.players.some(p => p.userId === userId)) return lobby;
  if (lobby.players.length >= lobby.maxPlayers) return { error: 'FULL' };
  const teamOrder: Team[] = ['A','B','C','D'];
  const team = teamOrder[lobby.players.length];
  const player: LobbyPlayerRef = { userId, team, joinedAt: new Date() };
  await col.updateOne({ lobbyCode: code }, { $push: { players: player } });
  return { ...(await col.findOne({ lobbyCode: code }))! };
}

export async function startLobby(code: string): Promise<{ lobby?: Lobby; error?: string }> {
  const col = await getCollection<Lobby>('lobbies');
  const lobby = await col.findOne({ lobbyCode: code });
  if (!lobby) return { error: 'NOT_FOUND' };
  if (lobby.status !== 'open') return { error: 'INVALID_STATUS' };
  await col.updateOne({ lobbyCode: code }, { $set: { status: 'starting' } });
  const next = await col.findOne({ lobbyCode: code });
  return { lobby: next! };
}

export async function attachGameToLobby(code: string, gameId: string) {
  const col = await getCollection<Lobby>('lobbies');
  await col.updateOne({ lobbyCode: code }, { $set: { gameId, status: 'started' } });
}

export async function closeLobby(code: string) {
  const col = await getCollection<Lobby>('lobbies');
  await col.updateOne({ lobbyCode: code }, { $set: { status: 'closed' } });
}
