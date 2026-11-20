"use client";

import { useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { logStudyTime } from "@/app/actions";

export function StudyTimer() {
  const [pending, startTransition] = useTransition();

  function add(minutes: number) {
    startTransition(async () => {
      await logStudyTime(minutes);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {pending && <Loader2 className="h-3 w-3 animate-spin text-arcane-300" />}
      {[15, 30].map((m) => (
        <button
          key={m}
          disabled={pending}
          onClick={() => add(m)}
          className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[9.5px] text-zinc-500 transition-colors hover:border-arcane-400/25 hover:text-arcane-200 disabled:opacity-50"
          title={`Registrar ${m} minutos de estudo`}
        >
          <Plus className="h-2.5 w-2.5" />
          {m}min
        </button>
      ))}
    </div>
  );
}
