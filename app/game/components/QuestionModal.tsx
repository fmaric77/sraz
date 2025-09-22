import React from 'react';

interface QuestionModalProps {
  open: boolean;
  question?: { text: string; choices: string[] } | null;
  remainingMs?: number;
  onAnswer?: (idx: number) => void;
  onClose?: () => void;
}

const QuestionModal: React.FC<QuestionModalProps> = ({ open, question, remainingMs, onAnswer, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm bg-black/60">
      <div className="w-full max-w-lg rounded-xl shadow-2xl border border-slate-700 bg-gradient-to-br from-slate-850 via-slate-800 to-slate-900 text-slate-100 p-5 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg md:text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-cyan-300 to-teal-300 drop-shadow">Question</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 text-sm"
            aria-label="Close question dialog"
          >×</button>
        </div>
        <p className="text-sm md:text-base leading-relaxed font-medium text-slate-200">
          {question?.text}
        </p>
        <div className="grid gap-3">
          {question?.choices.map((c, i) => {
            const label = String.fromCharCode(65 + i);
            return (
              <button
                key={i}
                onClick={() => onAnswer?.(i)}
                className="group relative w-full text-left rounded-lg border border-slate-600/60 bg-slate-800/60 backdrop-blur hover:border-cyan-400/70 hover:bg-slate-700/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 transition-colors px-3 py-2 flex items-start gap-3"
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-700/70 text-xs font-semibold text-cyan-300 border border-slate-600 group-hover:border-cyan-300 group-hover:text-cyan-200">
                  {label}
                </span>
                <span className="text-sm md:text-[0.95rem] text-slate-200 group-hover:text-white leading-snug">
                  {c}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <div className="text-xs text-slate-400 tracking-wide font-mono">
            {remainingMs !== undefined ? Math.ceil(remainingMs / 1000) + 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionModal;
