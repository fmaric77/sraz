'use client';
import React from 'react';

export function Avatar({ name, email, size = 32 }: { name?: string | null; email?: string | null; size?: number }) {
  const base = name && name.trim() ? name : (email || '');
  const initials = base
    .split(/\s|_|-|\./)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join('') || '?';
  const dim = size;
  return (
    <div
      style={{ width: dim, height: dim }}
      className="relative inline-flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 text-white font-semibold text-xs ring-2 ring-indigo-400/40 shadow"
      aria-label={name ? `Avatar for ${name}` : 'User avatar'}
    >
      <span className="select-none" style={{ lineHeight: 1 }}>{initials}</span>
    </div>
  );
}
