import GamePage from '../page';
// Dynamic route wrapper so that /game/[id] works; underlying component already parses path fallback.
export default function DynamicGamePage() {
  return <GamePage />;
}
