"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { resetProgress } from "@/app/actions";

export function ResetProgressButton() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    startTransition(async () => {
      await resetProgress();
      setDone(true);
      setConfirming(false);
    });
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-[11.5px] text-emerald-300">
        <Check className="h-3.5 w-3.5" /> Progresso apagado. Um novo começo.
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-[11.5px] text-rose-300 transition-colors hover:bg-rose-400/[0.12]"
      >
        <Trash2 className="h-3.5 w-3.5" /> Apagar todo o progresso
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.05] p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
        <div>
          <p className="text-[12px] font-medium text-rose-200">Isso não pode ser desfeito.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            Aulas concluídas, código salvo, desafios, projetos, tempo de estudo, notas, favoritos e
            revisões serão apagados. O conteúdo das trilhas permanece.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={reset}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/20 px-3 py-1.5 text-[11px] text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Sim, apagar tudo
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// lucide Check is imported separately to keep the success state self-contained.
function Check({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
