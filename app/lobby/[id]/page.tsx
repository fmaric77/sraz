// Removed ts-nocheck for type checking
import { LobbyClient } from './LobbyClient';

// Let Next.js infer the PageProps shape; avoid declaring a custom interface that conflicts with generated types.
export default async function LobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LobbyClient lobbyId={id} />;
}
