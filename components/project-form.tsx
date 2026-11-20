"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { saveProjectProgress } from "@/app/actions";
import { cn } from "@/lib/utils";

const statuses = [
  { value: "todo", label: "Não iniciado" },
  { value: "in_progress", label: "Em andamento" },
  { value: "done", label: "Concluído" },
];

export function ProjectForm({
  projectId,
  initialStatus,
  initialRepo,
  initialNotes,
}: {
  projectId: string;
  initialStatus: string;
  initialRepo: string;
  initialNotes: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [repoUrl, setRepoUrl] = useState(initialRepo);
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveProjectProgress({ projectId, status, repoUrl, notes });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Seu projeto</p>
        {saved && (
          <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
            <Check className="h-3 w-3" /> salvo
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[12px] transition-colors",
              status === s.value
                ? "border-arcane-400/30 bg-arcane-500/[0.09] text-arcane-100"
                : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                status === s.value ? "bg-arcane-400" : "bg-zinc-700"
              )}
            />
            {s.label}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">repositório</span>
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/voce/projeto"
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11.5px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-700 focus:border-arcane-400/30"
        />
      </label>

      <label className="mt-3 block">
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">notas e decisões</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Decisões de arquitetura, trade-offs, o que aprendeu..."
          className="mt-1.5 min-h-[110px] w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11.5px] leading-relaxed text-zinc-300 outline-none transition-colors placeholder:text-zinc-700 focus:border-arcane-400/30"
        />
      </label>

      <button
        onClick={save}
        disabled={pending}
        className="btn-primary mt-3 w-full py-2 text-[12px]"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Salvar progresso
      </button>
    </div>
  );
}
