import React from 'react';
import { posToCode } from '@/lib/board';

interface Props {
  x: number; y: number;
  category: string;
  children?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  droppable?: boolean;
  onPieceDrop?: (x: number, y: number, pieceId: string) => void;
  blackHole?: boolean;
}

const Square: React.FC<Props> = ({ x, y, category, children, onClick, selected, droppable, onPieceDrop, blackHole }) => {
  const isDark = (x + y) % 2 === 1; // classic chess pattern: a1 (0,0) light
  const baseColor = isDark ? 'sq-dark' : 'sq-light';
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
  className={`aspect-square flex flex-col justify-center items-center text-[10px] sm:text-[11px] md:text-[12px] cursor-pointer relative select-none ${baseColor} ${selectedRing} ${dropOutline} ${holeClass} transition`}
      title={`${category} • ${code}`}
    >
      <span className={`absolute top-0 left-0 text-[8px] p-0.5 ${isDark ? 'text-emerald-100/70' : 'text-emerald-900/60'}`}>{category.slice(0,3)}</span>
      <span className={`absolute bottom-0 right-0 text-[8px] p-0.5 ${isDark ? 'text-emerald-100/50' : 'text-emerald-900/40'}`}>{code}</span>
      {children}
    </div>
  );
};

export default Square;
