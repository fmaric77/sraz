"use client";
import React from 'react';
import { useCurrentUser } from './components/CurrentUserProvider';
import { getBoardSkin } from '@/lib/skins';

export function SkinClass({ children }: { children: React.ReactNode }) {
  const { selectedBoardSkin } = useCurrentUser();
  const skin = getBoardSkin(selectedBoardSkin || undefined);
  const cls = skin?.cssClass || 'skin-emerald';
  return <div className={cls}>{children}</div>;
}