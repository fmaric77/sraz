"use client";
import React from 'react';
import { CATEGORIES } from '@/models/types';

// Map category to class used on squares (same slug logic as in Square.tsx)
function toClass(cat: string) {
  return 'cat-' + cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

interface Props {
  compact?: boolean; // multi-column compact grid
  vertical?: boolean; // force single column vertical list (for side legend)
  className?: string;
}

const CategoryLegend: React.FC<Props> = ({ compact = false, vertical = false, className = '' }) => {
  const layoutClass = vertical
    ? 'flex flex-col gap-2'
    : `grid gap-2 ${compact ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'}`;
  return (
    <div className={`${layoutClass} ${className}`}>
      {CATEGORIES.map(cat => {
        const cls = toClass(cat);
        return (
          <div key={cat} className="relative flex items-center gap-2 px-2 py-1 rounded-md ring-1 ring-black/50 shadow-sm text-[11px] font-medium backdrop-blur-sm bg-slate-900/30">
            <span className={`w-6 h-6 rounded-sm ${cls} flex-shrink-0 border border-black/50`} aria-hidden />
            <span className="leading-tight" title={cat}>{cat}</span>
          </div>
        );
      })}
    </div>
  );
};

export default CategoryLegend;
