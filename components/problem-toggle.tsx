"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { setProblemSolved } from "@/app/actions";
import { cn } from "@/lib/utils";

export function ProblemToggle({
  problemId,
  solved,
  compact = false,
}: {
  problemId: string;
  solved: boolean;
  compact?: boolean;
}) {
  const [isSolved, setSolved] = useState(solved);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !isSolved;
    setSolved(next);
    startTransition(async () => {
      await setProblemSolved(problemId, next);
    });
  }

  if (compact) {
    return (
      <button
        onClick={toggle}
        disabled={pending}
        title={isSolved ? "Marcar como não resolvido" : "Marcar como resolvido"}
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors",
          isSolved
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
            : "border-white/10 bg-white/[0.02] text-zinc-600 hover:border-arcane-400/30 hover:text-arcane-300"
        )}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isSolved ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
        isSolved
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-arcane-400/25 hover:text-arcane-300"
      )}
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      {isSolved ? "resolvido" : "marcar resolvido"}
    </button>
  );
}
