import React from 'react';
import Image from 'next/image';
import { Piece } from '@/models/types';

const levelGlyph: Record<number, string> = { 1: 'P', 2: 'N', 3: 'C' }; // fallback glyphs

interface PieceViewProps { piece: Piece; onDragStart?: (piece: Piece) => void; demoted?: boolean; promoted?: boolean; draggableOverride?: boolean }

const PieceView: React.FC<PieceViewProps> = ({ piece, onDragStart, demoted, promoted, draggableOverride = true }) => {
  const imgEl = React.useRef<HTMLImageElement | null>(null);
  const setImgRef = React.useCallback((el: HTMLImageElement | null) => { imgEl.current = el; }, []);
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
          <Image
            ref={setImgRef}
            src="/images/pawn.png"
            alt={`Pawn ${piece.team}`}
            width={96}
            height={96}
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
            unoptimized
          />
          <span className="absolute bottom-0 right-0 text-[9px] font-black opacity-80">{piece.team}</span>
        </>
      )}
      {piece.isFlag && (
        <div className="w-full h-full flex items-center justify-center pointer-events-none select-none relative">
          <Image
            ref={setImgRef}
            src="/animations/1.gif"
            alt={`Flag ${piece.team}`}
            width={64}
            height={64}
            className={`w-9 h-9 md:w-11 md:h-11 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)] flag-team-${piece.team.toLowerCase()}`}
            draggable={false}
            unoptimized
          />
          <span className="absolute bottom-0 right-0 text-[9px] font-black opacity-85 bg-black/35 rounded px-0.5 leading-none">{piece.team}</span>
        </div>
      )}
  {piece.level === 2 && !piece.isFlag && (
        <>
          <Image
            ref={setImgRef}
            src="/images/knight.png"
            alt={`Knight ${piece.team}`}
            width={96}
            height={96}
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
            unoptimized
          />
          <span className="absolute bottom-0 right-0 text-[9px] font-black opacity-80">{piece.team}</span>
        </>
      )}
  {piece.level === 3 && !piece.isFlag && (
        <>
          <Image
            ref={setImgRef}
            src="/images/cavalry.png"
            alt={`Cavalry ${piece.team}`}
            width={96}
            height={96}
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
            unoptimized
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
