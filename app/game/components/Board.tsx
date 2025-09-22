import React from 'react';
import { Piece, Team } from '@/models/types';
import Square from './Square';
import PieceView from './Piece';

interface BoardProps {
  categories: string[][];
  pieces: Piece[];
  onSelect?: (x: number, y: number) => void;
  selected?: { x: number; y: number } | null;
  onRequestMove?: (payload: { pieceId: string; toX: number; toY: number; category: string }) => void;
  activeTeam?: Team;
  controllableTeam?: Team | null; // the team current user controls (remote)
  lastMovedPieceId?: string | null;
  events?: { type: string; pieceId: string }[] | null;
  blackHoles?: { x: number; y: number }[];
  interactive?: boolean; // if false, disable drag/drop & clicks
}

function isNeighbor(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  if (dx === 0 && dy === 0) return false;
  return dx <= 1 && dy <= 1;
}

const Board: React.FC<BoardProps> = ({ categories, pieces, onSelect, selected, onRequestMove, activeTeam, controllableTeam, lastMovedPieceId, events, blackHoles, interactive = true }) => {
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const draggingPiece = draggingId ? pieces.find(p => p.id === draggingId) : null;
  const demotedIds = new Set(events?.filter(e => e.type === 'demotion').map(e => e.pieceId));
  const promotedIds = new Set(events?.filter(e => e.type === 'promotion').map(e => e.pieceId));
  const bhSet = new Set(blackHoles?.map(b => `${b.x},${b.y}`));

  return (
  <div className="board-shell board-responsive mx-auto overflow-hidden overflow-x-auto max-w-full">
      <div className="board-frame inline-grid grid-cols-8 rounded overflow-hidden">
      {categories.map((row, y) => row.map((cat, x) => {
  const piece = pieces.find(p => p.alive && p.x === x && p.y === y);
        const isSelected = selected && selected.x === x && selected.y === y;
  const droppable = !!draggingPiece && isNeighbor(draggingPiece.x, draggingPiece.y, x, y) && (!piece || piece.team !== draggingPiece.team) && !bhSet.has(`${x},${y}`);
        const isBlackHole = bhSet.has(`${x},${y}`);
        return (
          <Square
            key={`${x}-${y}`}
            x={x}
            y={y}
            category={cat}
            blackHole={isBlackHole}
            onClick={() => { if (interactive) onSelect?.(x,y); }}
            selected={!!isSelected}
            droppable={droppable}
            onPieceDrop={(dx: number, dy: number, pid: string) => {
              if (!interactive) return;
              if (!draggingPiece) return;
              if (pid !== draggingPiece.id) return;
              if (!isNeighbor(draggingPiece.x, draggingPiece.y, dx, dy)) return;
              // Allow move to empty or enemy-occupied square (capture handled upstream)
              const occupiedByAlly = pieces.some(p => p.alive && p.x === dx && p.y === dy && p.team === draggingPiece.team);
              if (occupiedByAlly) return;
              onRequestMove?.({ pieceId: pid, toX: dx, toY: dy, category: cat });
              setDraggingId(null);
            }}
          >
            {piece && (
              <div className={piece.id === lastMovedPieceId ? 'relative group' : ''}>
                {piece.id === lastMovedPieceId && (
                  <div className="pointer-events-none absolute inset-0 animate-pulse last-move-ring" />
                )}
                {isBlackHole && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-black/80 shadow-inner ring-2 ring-purple-600 animate-pulse" />
                  </div>
                )}
                <PieceView piece={piece} demoted={demotedIds.has(piece.id)} promoted={promotedIds.has(piece.id)} draggableOverride={interactive} onDragStart={(p: Piece)=> {
                  if (!interactive) return;
                  if (controllableTeam && p.team !== controllableTeam) return; // must own the piece
                  if (activeTeam && p.team !== activeTeam) return; // must also be correct turn
                  setDraggingId(p.id);
                }} />
              </div>
            )}
            {!piece && isBlackHole && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-black/80 shadow-inner ring-2 ring-purple-600 animate-pulse" />
              </div>
            )}
          </Square>
        );
      }))}
      </div>
    </div>
  );
};

export default Board;
