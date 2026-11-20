"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { submitReview } from "@/app/actions";
import { cn } from "@/lib/utils";

const options = [
  { quality: 0 as const, label: "Errei", hint: "rever amanhã", className: "border-rose-400/25 bg-rose-400/[0.07] text-rose-300 hover:bg-rose-400/[0.12]" },
  { quality: 1 as const, label: "Difícil", hint: "reforçar", className: "border-amber-400/25 bg-amber-400/[0.07] text-amber-300 hover:bg-amber-400/[0.12]" },
  { quality: 2 as const, label: "Bom", hint: "no ritmo", className: "border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-300 hover:bg-cyan-400/[0.12]" },
  { quality: 3 as const, label: "Fácil", hint: "dominei", className: "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300 hover:bg-emerald-400/[0.12]" },
];

export function ReviewActions({ itemId }: { itemId: string }) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2 text-[11px] text-emerald-300">
        <Check className="h-3.5 w-3.5" /> Revisão registrada e reagendada.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
      {options.map((opt) => (
        <button
          key={opt.quality}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await submitReview(itemId, opt.quality);
              setDone(true);
            })
          }
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:opacity-50",
            opt.className
          )}
        >
          <span className="block text-[10.5px] font-medium">{opt.label}</span>
          <span className="block font-mono text-[8px] opacity-60">{opt.hint}</span>
        </button>
      ))}
    </div>
  );
}
