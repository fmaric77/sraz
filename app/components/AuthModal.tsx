'use client';
import React, { useState } from 'react';
import { useAuthModal } from './AuthModalProvider';
import { signIn } from 'next-auth/react';
import { useCurrentUser } from './CurrentUserProvider';

interface FormState {
  email: string;
  password: string;
  confirm?: string;
}

export function AuthModal() {
  const { isOpen, close, mode, setMode } = useAuthModal();
  const [form, setForm] = useState<FormState>({ email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useCurrentUser();

  if (!isOpen) return null;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        if (!form.email || !form.password) throw new Error('Email and password required');
        if (form.password.length < 6) throw new Error('Password must be at least 6 characters');
        if (form.password !== form.confirm) throw new Error('Passwords do not match');
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, password: form.password })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Registration failed');
        }
        // auto sign-in
        const si = await signIn('credentials', { redirect: false, email: form.email, password: form.password });
        if (si?.error) throw new Error(si.error);
        await refresh();
        close();
      } else {
        const si = await signIn('credentials', { redirect: false, email: form.email, password: form.password });
        if (si?.error) throw new Error(si.error === 'CredentialsSignin' ? 'Invalid credentials' : si.error);
        await refresh();
        close();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Error');
      } else {
        setError('Error');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={close}>
      <div
        className="w-full max-w-sm rounded-lg border border-slate-700 bg-gradient-to-b from-slate-900/90 via-slate-800/90 to-slate-900/90 p-6 shadow-2xl text-slate-100"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={close}
            className="rounded p-1 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 transition"
            aria-label="Close auth modal"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-slate-200">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              required
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-slate-200">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Password</span>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={onChange}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              required
              placeholder="••••••••"
            />
          </label>
          {mode === 'register' && (
            <label className="block text-slate-200">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Confirm Password</span>
              <input
                name="confirm"
                type="password"
                value={form.confirm}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                required
                placeholder="Repeat password"
              />
            </label>
          )}
          {error && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="group relative w-full overflow-hidden rounded-md bg-indigo-600 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <span className="relative z-10">
              {loading
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating...'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </span>
          </button>
        </form>
        <div className="mt-5 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => setMode('register')}
              className="font-medium text-indigo-400 hover:text-indigo-300 transition"
            >
              Need an account? Register
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode('login')}
              className="font-medium text-indigo-400 hover:text-indigo-300 transition"
            >
              Have an account? Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
