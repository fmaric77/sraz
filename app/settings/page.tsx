'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useCurrentUser } from '@/app/components/CurrentUserProvider';
import { useTranslation } from '@/app/components/TranslationProvider';

interface MeResponse {
  user: { id: string; email: string; name?: string; language?: string; elo: number; wins: number; losses: number; draws: number } | null;
}

export default function SettingsPage() {
  const { userId, email, name: ctxName, language: ctxLanguage, elo, refresh, setOptimisticName } = useCurrentUser();
  const { t } = useTranslation();
  const router = useRouter();
  const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({});
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Name form state defined unconditionally; will be initialized when data loads
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/user/me');
        setData(await res.json());
      } finally { setLoading(false); }
    })();
  }, []);

  // When data becomes available, seed name and language once (do not overwrite user edits afterward)
  // Load translated texts when language changes
  useEffect(() => {
    const loadTranslations = async () => {
      if (!ctxLanguage || ctxLanguage === 'en') {
        setTranslatedTexts({});
        return;
      }

      const textsToTranslate = [
        'Settings',
        'Manage your identity and competitive stats.',
        'Profile',
        'Competitive',
        'Session',
        'Email',
        'Display Name',
        'Language',
        'Choose your preferred language for the interface and questions.',
        'Save Settings',
        'Saving…',
        'Saved!',
        'No changes to save.',
        '2–24 chars. Letters, numbers, spaces, _ and - allowed.',
        'Not logged in',
        'Sign in to manage your profile and stats.',
        'Loading settings…',
        'Elo',
        'Wins',
        'Losses',
        'Draws',
        'Log Out',
        'Log out of your current session. You can sign back in anytime to retain your rating and history.',
        'Close settings'
      ];

      const translations: Record<string, string> = {};
      for (const text of textsToTranslate) {
        translations[text] = await t(text);
      }
      setTranslatedTexts(translations);
    };

    loadTranslations();
  }, [ctxLanguage, t]);

  useEffect(() => {
    if (data?.user) {
      setName(prev => prev || ctxName || data.user?.name || '');
      setLanguage(prev => prev || ctxLanguage || data.user?.language || 'en');
    }
  }, [data?.user, ctxName, ctxLanguage]);

  // Escape key to exit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        router.push('/');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center w-full">
      <div className="text-sm text-slate-300 animate-pulse">{translatedTexts['Loading settings…'] || 'Loading settings…'}</div>
    </div>
  );
  if (!data?.user || !userId) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center w-full p-6">
      <div className="px-6 py-4 rounded-xl bg-slate-800/70 border border-slate-700 text-sm text-slate-300 backdrop-blur shadow-lg">
        <p className="mb-2 font-medium text-slate-200">{translatedTexts['Not logged in'] || 'Not logged in'}</p>
        <p className="text-xs text-slate-400">{translatedTexts['Sign in to manage your profile and stats.'] || 'Sign in to manage your profile and stats.'}</p>
      </div>
    </div>
  );
  const u = data.user;

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaveMsg(null);
    setSaving(true);
    try {
      const updateData: { name?: string; language?: string } = {};

      if (name !== (data?.user?.name || '')) {
        updateData.name = name;
      }

      if (language !== (data?.user?.language || 'en')) {
        updateData.language = language;
      }

      if (!updateData.name && !updateData.language) {
        setSaveMsg(translatedTexts['No changes to save.'] || 'No changes to save.');
        return;
      }

      const res = await fetch('/api/user/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
      const js = await res.json().catch(()=>({}));
      if (!res.ok) {
        if (js.error === 'INVALID_NAME') setSaveMsg(translatedTexts['2–24 chars. Letters, numbers, spaces, _ and - allowed.'] || '2–24 chars. Letters, numbers, spaces, _ and - allowed.');
        else if (js.error === 'INVALID_CHARS') setSaveMsg(translatedTexts['2–24 chars. Letters, numbers, spaces, _ and - allowed.'] || '2–24 chars. Letters, numbers, spaces, _ and - allowed.');
        else if (js.error === 'INVALID_LANGUAGE') setSaveMsg('Invalid language code.');
        else setSaveMsg('Update failed.');
      } else {
        setSaveMsg(translatedTexts['Saved!'] || 'Saved!');
        if (updateData.name) setOptimisticName(name);
        await refresh();
      }
    } finally {
      setSaving(false);
    }
  }
  return (
  <div className="min-h-screen w-full py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-300 via-cyan-300 to-indigo-300 bg-clip-text text-transparent drop-shadow-sm">{translatedTexts['Settings'] || 'Settings'}</h1>
            <p className="text-xs mt-1 text-slate-400 tracking-wide">{translatedTexts['Manage your identity and competitive stats.'] || 'Manage your identity and competitive stats.'}</p>
          </div>
          <button aria-label={translatedTexts['Close settings'] || 'Close settings'} onClick={() => router.push('/')} className="group rounded-full p-2 border border-slate-600/70 bg-slate-800/70 hover:bg-slate-700/70 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition shadow focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <section className="relative rounded-xl border border-slate-700/70 bg-slate-900/60 backdrop-blur-md p-5 shadow-lg overflow-hidden">
              <div className="absolute inset-0 pointer-events-none rounded-xl opacity-40 mix-blend-overlay" style={{background:'radial-gradient(circle at 15% 20%, rgba(16,185,129,0.25), transparent 60%), radial-gradient(circle at 85% 70%, rgba(59,130,246,0.25), transparent 65%)'}} />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-4">{translatedTexts['Profile'] || 'Profile'}</h2>
              <div className="space-y-4 text-sm relative">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">{translatedTexts['Email'] || 'Email'}</span>
                  <div className="px-3 py-2 rounded bg-slate-800/70 border border-slate-700 text-slate-200 text-xs break-all">{email}</div>
                </div>
                <form onSubmit={saveSettings} className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{translatedTexts['Display Name'] || 'Display Name'}</label>
                    <input value={name} onChange={e=>setName(e.target.value)} maxLength={24} className="w-full rounded-md bg-slate-800/70 border border-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 px-3 py-2 text-sm placeholder:text-slate-500 transition" placeholder="Your public name" />
                    <p className="text-[10px] text-slate-500 leading-snug">{translatedTexts['2–24 chars. Letters, numbers, spaces, _ and - allowed.'] || '2–24 chars. Letters, numbers, spaces, _ and - allowed.'}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{translatedTexts['Language'] || 'Language'}</label>
                    <select value={language} onChange={e=>setLanguage(e.target.value)} className="w-full rounded-md bg-slate-800/70 border border-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 px-3 py-2 text-sm text-slate-200 transition">
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="it">Italiano</option>
                      <option value="pt">Português</option>
                      <option value="ru">Русский</option>
                      <option value="ja">日本語</option>
                      <option value="ko">한국어</option>
                      <option value="zh">中文</option>
                      <option value="ar">العربية</option>
                      <option value="hi">हिन्दी</option>
                      <option value="hr">Hrvatski</option>
                    </select>
                    <p className="text-[10px] text-slate-500 leading-snug">{translatedTexts['Choose your preferred language for the interface and questions.'] || 'Choose your preferred language for the interface and questions.'}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button disabled={saving} className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-4 py-2 font-medium shadow shadow-emerald-900/40">{saving ? (translatedTexts['Saving…'] || 'Saving…') : (translatedTexts['Save Settings'] || 'Save Settings')}</button>
                    {saveMsg && <div className="text-[11px] text-slate-400">{saveMsg}</div>}
                  </div>
                </form>
              </div>
            </section>
          </div>
          <div className="space-y-6">
            <section className="relative rounded-xl border border-slate-700/70 bg-slate-900/60 backdrop-blur-md p-5 shadow-lg overflow-hidden">
              <div className="absolute inset-0 pointer-events-none rounded-xl opacity-40 mix-blend-overlay" style={{background:'radial-gradient(circle at 20% 25%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(circle at 80% 70%, rgba(59,130,246,0.15), transparent 65%)'}} />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-4">{translatedTexts['Competitive'] || 'Competitive'}</h2>
              <ul className="space-y-2 text-xs relative">
                <li className="flex items-center justify-between bg-slate-800/40 border border-slate-700/70 rounded px-3 py-2"><span className="text-slate-400">{translatedTexts['Elo'] || 'Elo'}</span><span className="font-semibold text-slate-200">{elo}</span></li>
                <li className="flex items-center justify-between bg-slate-800/40 border border-slate-700/70 rounded px-3 py-2"><span className="text-slate-400">{translatedTexts['Wins'] || 'Wins'}</span><span className="font-semibold text-emerald-300">{u.wins}</span></li>
                <li className="flex items-center justify-between bg-slate-800/40 border border-slate-700/70 rounded px-3 py-2"><span className="text-slate-400">{translatedTexts['Losses'] || 'Losses'}</span><span className="font-semibold text-rose-300">{u.losses}</span></li>
                <li className="flex items-center justify-between bg-slate-800/40 border border-slate-700/70 rounded px-3 py-2"><span className="text-slate-400">{translatedTexts['Draws'] || 'Draws'}</span><span className="font-semibold text-indigo-300">{u.draws}</span></li>
              </ul>
            </section>
            <section className="rounded-xl border border-slate-700/70 bg-gradient-to-br from-red-900/50 via-slate-900/60 to-slate-900/60 backdrop-blur-md p-5 shadow-lg">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-3">{translatedTexts['Session'] || 'Session'}</h2>
              <p className="text-[11px] text-slate-400 mb-4 leading-snug">{translatedTexts['Log out of your current session. You can sign back in anytime to retain your rating and history.'] || 'Log out of your current session. You can sign back in anytime to retain your rating and history.'}</p>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="w-full text-xs font-semibold tracking-wide rounded-md bg-red-600 hover:bg-red-500 active:bg-red-700 text-white py-2.5 shadow shadow-red-900/40 transition">{translatedTexts['Log Out'] || 'Log Out'}</button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
