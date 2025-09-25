"use client";
import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCurrentUser } from '@/app/components/CurrentUserProvider';

function SuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useCurrentUser();
  useEffect(() => { 
    refresh();
    const sid = params.get('session_id');
    if (sid) {
      fetch('/api/store/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid }) })
        .then(()=> refresh())
        .catch(()=>{});
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.push('/store');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh, params, router]);
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 relative">
      <button
        aria-label="Close"
        title="Close"
        onClick={() => router.push('/store')}
        className="fixed top-3 right-3 z-50 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
      >
        ×
      </button>
      <div className="px-6 py-4 rounded-xl bg-slate-800/70 border border-slate-700 text-sm text-slate-300 backdrop-blur shadow-lg text-center">
        <div className="font-semibold mb-1">Payment Success</div>
        <div className="text-xs text-slate-400 mb-3">Session: {params.get('session_id')}</div>
        <button onClick={()=> router.push('/store')} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">Back to Store</button>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full flex items-center justify-center p-6 text-slate-300">Loading…</div>}>
      <SuccessInner />
    </Suspense>
  );
}