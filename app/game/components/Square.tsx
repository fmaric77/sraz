import React from 'react';
import { posToCode } from '@/lib/board';

interface Props {
  x: number; y: number;
  category: string; // full category label
  children?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  droppable?: boolean;
  onPieceDrop?: (x: number, y: number, pieceId: string) => void;
  blackHole?: boolean;
}

// Utility to convert category label to a safe CSS class suffix (must stay in sync with globals.css definitions)
function categoryToClass(cat: string) {
  return 'cat-' + cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const Square: React.FC<Props> = ({ x, y, category, children, onClick, selected, droppable, onPieceDrop, blackHole }) => {
  const catClass = categoryToClass(category);
  const selectedRing = selected ? 'sq-selected' : '';
  const dropOutline = droppable ? 'sq-droppable' : '';
  const holeClass = blackHole ? 'relative after:absolute after:inset-0 after:bg-gradient-radial after:from-purple-800/60 after:to-transparent after:animate-pulse' : '';
  const code = posToCode(x, y);
  return (
    <div
      onClick={onClick}
      onDragOver={(e) => { if (droppable) { e.preventDefault(); } }}
      onDrop={(e) => {
        if (!droppable) return;
        const pieceId = e.dataTransfer.getData('application/x-piece-id');
        if (pieceId) onPieceDrop?.(x, y, pieceId);
      }}
      className={`aspect-square flex flex-col justify-center items-center text-[10px] sm:text-[11px] md:text-[12px] cursor-pointer relative select-none ${catClass} ${selectedRing} ${dropOutline} ${holeClass} transition`}
      title={`${category} • ${code}`}
    >
      {/* Compact category & coord labels (consistent coloring for contrast across varied backgrounds) */}
      <span className={`absolute top-0 left-0 text-[8px] p-0.5 font-medium text-black/60 dark:text-black/70 drop-shadow-sm`}>{category.slice(0,3)}</span>
      <span className={`absolute bottom-0 right-0 text-[8px] p-0.5 text-black/45 dark:text-black/50`}>{code}</span>
      {children}
    </div>
  );
};

export default Square;
