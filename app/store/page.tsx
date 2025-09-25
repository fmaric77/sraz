"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '@/app/components/CurrentUserProvider';
import { BOARD_SKINS } from '@/lib/skins';
import { useRouter } from 'next/navigation';

export default function StorePage() {
  const router = useRouter();
  const { userId, purchasedSkins, selectedBoardSkin, refresh } = useCurrentUser();
  const [loading, setLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<'store' | 'my'>('store');
  const owned = useMemo(() => new Set(purchasedSkins), [purchasedSkins]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.back();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  async function buy(skinId: string) {
    setLoading(skinId);
    try {
      const res = await fetch('/api/store/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skinId })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      }
    } finally { setLoading(null); }
  }

  async function select(skinId: string) {
    setLoading('select:' + skinId);
    try {
      const res = await fetch('/api/store/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skinId }) });
      if (res.ok) await refresh();
    } finally { setLoading(null); }
  }

  if (!userId) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6">
        <div className="px-6 py-4 rounded-xl bg-slate-800/70 border border-slate-700 text-sm text-slate-300 backdrop-blur shadow-lg">
          Sign in to access the Skins Store.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-6 relative">
      <button
        aria-label="Close"
        title="Close"
        onClick={() => router.back()}
        className="fixed top-3 right-3 z-50 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
      >
        ×
      </button>
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Skins</h1>
        <p className="text-xs text-slate-400 mb-4">Board skins. €5 each. Test mode.</p>
        <div className="flex gap-2 mb-6 border-b border-slate-700/60">
          <button onClick={()=>setTab('store')} className={`px-3 py-2 text-sm ${tab==='store' ? 'text-white border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>Store</button>
          <button onClick={()=>setTab('my')} className={`px-3 py-2 text-sm ${tab==='my' ? 'text-white border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>My Skins</button>
        </div>
        {tab === 'store' ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BOARD_SKINS.map(s => {
              const isOwned = owned.has(s.id);
              const isSelected = selectedBoardSkin === s.id;
              return (
                <div key={s.id} className={`rounded-lg border p-3 bg-slate-900/50 border-slate-700/70 backdrop-blur shadow relative`}>
                  <div className={`aspect-video rounded mb-3 overflow-hidden ${s.cssClass}`}>
                    <div className="w-full h-full grid grid-cols-6 grid-rows-4">
                      {Array.from({ length: 24 }).map((_,i)=> (
                        <div key={i} className={(i%2? 'sq-dark':'sq-light') + ' border border-black/10'} />
                      ))}
                    </div>
                  </div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-400 mb-3">€{s.priceEuros.toFixed(2)}</div>
                  <div className="flex gap-2">
                    {!isOwned ? (
                      <button disabled={!!loading} onClick={()=>buy(s.id)} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50">{loading===s.id? 'Redirect…' : 'Buy'}</button>
                    ) : isSelected ? (
                      <span className="px-3 py-1.5 rounded bg-indigo-700/60 text-indigo-200 text-xs border border-indigo-500/40">Selected</span>
                    ) : (
                      <button disabled={!!loading} onClick={()=>select(s.id)} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium disabled:opacity-50">{loading==='select:'+s.id? 'Saving…' : 'Use Skin'}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {purchasedSkins.length === 0 ? (
              <div className="text-sm text-slate-400">You don&apos;t own any skins yet. Visit the Store to purchase.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {BOARD_SKINS.filter(s => owned.has(s.id)).map(s => {
                  const isSelected = selectedBoardSkin === s.id;
                  return (
                    <div key={s.id} className={`rounded-lg border p-3 bg-slate-900/50 border-slate-700/70 backdrop-blur shadow relative`}>
                      <div className={`aspect-video rounded mb-3 overflow-hidden ${s.cssClass}`}>
                        <div className="w-full h-full grid grid-cols-6 grid-rows-4">
                          {Array.from({ length: 24 }).map((_,i)=> (
                            <div key={i} className={(i%2? 'sq-dark':'sq-light') + ' border border-black/10'} />
                          ))}
                        </div>
                      </div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-400 mb-3">Owned</div>
                      <div className="flex gap-2">
                        {isSelected ? (
                          <span className="px-3 py-1.5 rounded bg-indigo-700/60 text-indigo-200 text-xs border border-indigo-500/40">Selected</span>
                        ) : (
                          <button disabled={!!loading} onClick={()=>select(s.id)} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium disabled:opacity-50">{loading==='select:'+s.id? 'Saving…' : 'Equip'}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}