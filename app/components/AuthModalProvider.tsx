'use client';
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type Mode = 'login' | 'register';

interface AuthModalContextValue {
  open: (mode?: Mode) => void;
  close: () => void;
  isOpen: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const open = useCallback((m: Mode = 'login') => { setMode(m); setIsOpen(true); }, []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <AuthModalContext.Provider value={{ open, close, isOpen, mode, setMode }}>
      {children}
    </AuthModalContext.Provider>
  );
}
