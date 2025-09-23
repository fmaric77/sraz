import React from 'react';
import { FaFlag } from 'react-icons/fa';
import { Piece } from '@/models/types';

const levelGlyph: Record<number, string> = { 1: 'P', 2: 'N', 3: 'C' }; // fallback glyphs

interface PieceViewProps { piece: Piece; onDragStart?: (piece: Piece) => void; demoted?: boolean; promoted?: boolean; draggableOverride?: boolean }

const PieceView: React.FC<PieceViewProps> = ({ piece, onDragStart, demoted, promoted, draggableOverride = true }) => {
  const imgEl = React.useRef<HTMLImageElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData('application/x-piece-id', piece.id);
    // Create a drag image that matches on-screen rendered size & tint exactly
    const img = imgEl.current;
    const cont = containerRef.current;
    if (img && cont) {
      const rect = cont.getBoundingClientRect();
      const wrapper = document.createElement('div');
      wrapper.style.width = rect.width + 'px';
      wrapper.style.height = rect.height + 'px';
      wrapper.style.position = 'absolute';
      wrapper.style.top = '-1000px';
      wrapper.style.left = '-1000px';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';
      const cloneImg = img.cloneNode(true) as HTMLImageElement;
      cloneImg.style.width = '100%';
      cloneImg.style.height = '100%';
      cloneImg.style.objectFit = 'contain';
      wrapper.appendChild(cloneImg);
      document.body.appendChild(wrapper);
      try {
        e.dataTransfer.setDragImage(wrapper, rect.width / 2, rect.height / 2);
      } catch {/* ignore */}
      setTimeout(() => { if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper); }, 0);
    }
    onDragStart?.(piece);
  }
  return (
    <div
      ref={containerRef}
  draggable={draggableOverride}
  onDragStart={draggableOverride ? handleDragStart : undefined}
  className={`w-[92%] h-[92%] flex items-center justify-center text-xs font-bold cursor-grab active:cursor-grabbing select-none relative rounded transition-colors ${demoted ? 'animate-demote-flash' : ''} ${promoted ? 'animate-promote-glow' : ''}`}
      style={{
        // Optional subtle outline to keep piece visible on similar colored squares
        filter: piece.level === 1 ? undefined : undefined
      }}
    >
      {piece.level === 1 && !piece.isFlag && (
        <>
          <img
            ref={imgEl}
            src="/images/pawn.png"
            alt={`Pawn ${piece.team}`}
            className={`w-full h-full object-contain pointer-events-none select-none ${piece.team === 'A' ? 'team-a-tint' : piece.team === 'B' ? 'team-b-tint' : piece.team === 'C' ? 'team-c-tint' : 'team-d-tint'}`}
            draggable={false}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              if (!target.dataset.fallback) {
                target.src = '/images/pawn.svg';
                target.dataset.fallback = '1';
              } else if (target.dataset.fallback === '1') {
                target.src = '/pawn.svg';
                target.dataset.fallback = '2';
              }
            }}
          />
          <span className="absolute bottom-0 right-0 text-[9px] font-black opacity-80">{piece.team}</span>
        </>
      )}
      {piece.isFlag && (
        <div className={`w-full h-full flex items-center justify-center pointer-events-none select-none ${piece.team === 'A' ? 'text-blue-300' : piece.team === 'B' ? 'text-rose-300' : piece.team === 'C' ? 'text-emerald-300' : 'text-amber-300'}`}> 
          <FaFlag className="w-8 h-8 md:w-10 md:h-10 drop-shadow flag-icon" />
          <span className="absolute bottom-0 right-0 text-[9px] font-black opacity-80">{piece.team}</span>
        </div>
      )}
  {piece.level === 2 && !piece.isFlag && (
        <>
          <img
            ref={imgEl}
            src="/images/knight.png"
            alt={`Knight ${piece.team}`}
            className={`w-full h-full object-contain pointer-events-none select-none ${piece.team === 'A' ? 'team-a-tint' : piece.team === 'B' ? 'team-b-tint' : piece.team === 'C' ? 'team-c-tint' : 'team-d-tint'}`}
            draggable={false}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              if (!target.dataset.fallback) {
                target.src = '/images/knight.svg';
                target.dataset.fallback = '1';
              } else if (target.dataset.fallback === '1') {
                target.src = '/images/knight.svg'; // stays svg fallback; no further
                target.dataset.fallback = '2';
              }
            }}
          />
          <span className="absolute bottom-0 right-0 text-[9px] font-black opacity-80">{piece.team}</span>
        </>
      )}
  {piece.level === 3 && !piece.isFlag && (
        <>
          <img
            ref={imgEl}
            src="/images/cavalry.png"
            alt={`Cavalry ${piece.team}`}
            className={`w-full h-full object-contain pointer-events-none select-none ${piece.team === 'A' ? 'team-a-tint' : piece.team === 'B' ? 'team-b-tint' : piece.team === 'C' ? 'team-c-tint' : 'team-d-tint'}`}
            draggable={false}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              if (!target.dataset.fallback) {
                target.src = '/images/cavalry.svg';
                target.dataset.fallback = '1';
              } else if (target.dataset.fallback === '1') {
                target.src = '/images/cavalry.svg';
                target.dataset.fallback = '2';
              }
            }}
          />
          <span className="absolute bottom-0 right-0 text-[9px] font-black opacity-80">{piece.team}</span>
        </>
      )}
      {piece.level > 3 && (
        <span className={`${piece.team === 'A' ? 'text-blue-300' : 'text-rose-300'} drop-shadow-sm`}>{levelGlyph[piece.level] || '?'}{piece.team}</span>
      )}
      {demoted && (
        <span className="absolute -top-1 -right-1 bg-amber-500 text-[10px] px-1 py-[1px] rounded shadow font-black">-1</span>
      )}
      {promoted && (
        <span className="absolute -top-1 -left-1 bg-emerald-500 text-[10px] px-1 py-[1px] rounded shadow font-black">+1</span>
      )}
    </div>
  );
};

export default PieceView;
