"use client";
import Link from 'next/link';
import Board from './game/components/Board';
import { createLocalGame } from '@/lib/board';
import { useAuthModal } from './components/AuthModalProvider';
import { useSession } from 'next-auth/react';
import { useCurrentUser } from './components/CurrentUserProvider';
import { Avatar } from './components/Avatar';
import React from 'react';
import { signOut } from 'next-auth/react';

export default function Home() {
  // Generate a static 4-player demo board
  const demo = createLocalGame(4);
  const { open } = useAuthModal();
  const { data: session } = useSession();
  const { name, email, userId } = useCurrentUser();
  const loggedIn = !!session?.user;
  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 text-slate-100">
      <header className="w-full px-6 py-4 grid grid-cols-3 items-center">
  <h1 className="text-xl font-bold">Mind Siege</h1>
        <div className="flex justify-center">
          <button
            onClick={async () => {
              interface CreateLobbyPayload { maxPlayers: number; hostUserId?: string }
              try {
                const payload: CreateLobbyPayload = { maxPlayers: 4 };
                if (loggedIn && userId) payload.hostUserId = userId; // ensure host maps to authenticated user
                const res = await fetch('/api/lobbies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (res.ok && data.lobby?.lobbyCode) {
                  try {
                    const hostId = data.lobby?.players?.[0]?.userId;
                    if (hostId) localStorage.setItem('userId', hostId);
                  } catch {}
                  window.location.href = `/lobby/${data.lobby.lobbyCode}`;
                }
              } catch (e) {
                console.error('Lobby creation failed', e);
                alert('Failed to create lobby');
              }
            }}
            className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 px-6 py-3 rounded text-white font-medium shadow-md transition"
          >
            {loggedIn ? 'Create Lobby' : 'Play (Create Lobby)'}
          </button>
        </div>
        <div className="flex gap-3 justify-end items-center relative">
          {loggedIn ? (
            <AvatarDropdown name={name} email={email} />
          ) : (
            <>
              <button onClick={() => open('login')} className="text-sm hover:text-white underline decoration-transparent hover:decoration-white transition">Sign In</button>
              <button onClick={() => open('register')} className="text-sm hover:text-white underline decoration-transparent hover:decoration-white transition">Register</button>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center w-full px-4">
        <div className="w-full flex flex-col items-center">
          <Board
            categories={demo.boardCategories}
            pieces={demo.pieces}
            blackHoles={demo.blackHoles}
            interactive={false}
          />
        </div>
      </main>
    </div>
  );
}

function AvatarDropdown({ name, email }: { name: string | null; email: string | null }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest?.('[data-avatar-menu-root]')) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div data-avatar-menu-root className="relative">
      <button onClick={() => setOpen(o=>!o)} className="flex items-center gap-2 group focus:outline-none">
        <Avatar name={name} email={email} size={36} />
        <span className="hidden sm:inline text-xs text-slate-300 group-hover:text-white transition font-medium max-w-[140px] truncate">{name || (email?.split('@')[0])}</span>
        <svg className={`w-3 h-3 text-slate-400 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-md border border-slate-700 bg-slate-900/95 backdrop-blur shadow-lg py-2 text-xs z-50 animate-fade-in">
          <div className="px-3 pb-2 text-[11px] text-slate-400 border-b border-slate-700 mb-2 truncate">{email}</div>
          <LinkItem href="/settings" label="Settings" />
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full text-left px-3 py-2 hover:bg-slate-700/60 text-slate-200 flex items-center gap-2"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

function LinkItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block px-3 py-2 hover:bg-slate-700/60 text-slate-200">
      {label}
    </Link>
  );
}

