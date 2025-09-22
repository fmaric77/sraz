import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 text-slate-100">
      <header className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Quiz Tactics</h1>
        <nav className="hidden sm:flex gap-6 text-sm text-slate-300">
          <Link href="/game" className="hover:text-white transition">Play</Link>
          <a href="https://github.com" target="_blank" rel="noopener" className="hover:text-white transition">GitHub</a>
          <Link href="/api/games" className="hover:text-white transition">API</Link>
        </nav>
      </header>
      <main className="flex-1 flex flex-col items-center text-center px-6 pt-12 pb-20">
        <div className="max-w-3xl space-y-6">
          <h2 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-amber-300 via-pink-300 to-violet-300 text-transparent bg-clip-text drop-shadow">
            Knowledge + Strategy on an 8×8 Battlefield
          </h2>
          <p className="text-sm sm:text-base leading-relaxed text-slate-300">
            A turn‑based multiplayer board game where every move is powered by trivia mastery. Move your pieces, answer category questions, promote units, push enemies back, and out-think your opponent.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <Link href="/game" className="inline-flex justify-center items-center rounded-md bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 px-6 py-3 font-medium text-white shadow-lg shadow-indigo-900/40 transition">
              Start a Demo Game
            </Link>
            <Link href="/lobby/new" className="inline-flex justify-center items-center rounded-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 px-6 py-3 font-medium text-white shadow-lg shadow-emerald-900/40 transition">
              Create Lobby
            </Link>
            <a href="/README" className="inline-flex justify-center items-center rounded-md border border-slate-600 hover:border-slate-400 px-6 py-3 font-medium text-slate-200 hover:text-white transition">
              Read the Spec
            </a>
          </div>
        </div>
        <section className="grid sm:grid-cols-3 gap-6 mt-16 max-w-5xl w-full">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white/5 border border-white/10 rounded-lg p-5 text-left hover:bg-white/10 transition backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-amber-300 text-sm tracking-wide uppercase">{f.title}</h3>
              <p className="text-xs leading-relaxed text-slate-300">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="py-6 text-center text-xs text-slate-400 border-t border-white/10">
        <p>© {new Date().getFullYear()} Quiz Tactics — MVP Prototype</p>
      </footer>
    </div>
  );
}

const FEATURES = [
  { title: 'Strategic Promotion', desc: 'Pieces level up (Pawn → Knight → Cavalry) only when they eliminate an enemy piece—timed captures matter.' },
  { title: 'Category Terrain', desc: 'Each square has a category. Your move only succeeds if you conquer its question in time.' },
  { title: 'Push & Demote Combat', desc: 'Higher level defenders are pushed back and demoted—set up chain reactions and lethal edge pushes.' },
  { title: 'Real-time Multiplayer', desc: 'Socket-powered turns and question prompts (coming soon in this scaffold).'},
  { title: 'Internationalization', desc: 'Google Translate integration planned for rapid multi-language play.' },
  { title: 'Persistent Progress', desc: 'Planned profiles, global leaderboard, and match history keep players engaged.' },
];
