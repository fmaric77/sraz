import Ably from 'ably';

// Singleton REST client (server only). Never expose raw key to client bundles.
let rest: Ably.Rest | null = null;

export function getAblyRest(): Ably.Rest | null {
  // Accept legacy misspelled var to ease migration, prefer ABLY_API_KEY
  const key = process.env.ABLY_API_KEY || process.env.ABLY_APY_KEY; // fallback if user had a typo
  if (!key) return null;
  if (!rest) rest = new Ably.Rest(key);
  return rest;
}

export type LobbyEventType = 'player.joined' | 'player.left' | 'lobby.started';
export type GameEventType = 'game.move';

export interface LobbyEventPayload { [key: string]: unknown }
export async function publishLobbyEvent(lobbyCode: string, type: LobbyEventType, data: LobbyEventPayload) {
  const r = getAblyRest();
  if (!r) return; // silently ignore if not configured
  const channel = r.channels.get(`lobby-${lobbyCode}`);
  await channel.publish(type, { type, data, ts: Date.now() });
}

export interface GameEventPayload { [key: string]: unknown }
export async function publishGameEvent(gameId: string, type: GameEventType, data: GameEventPayload) {
  const r = getAblyRest();
  if (!r) return;
  const channel = r.channels.get(`game-${gameId}`);
  await channel.publish(type, { type, data, ts: Date.now() });
}
