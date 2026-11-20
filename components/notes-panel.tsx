"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, NotebookPen } from "lucide-react";
import { saveLessonNotes } from "@/app/actions";

export function NotesPanel({ lessonId, initial }: { lessonId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function persist(next: string) {
    if (next === lastSaved.current) return;
    setStatus("saving");
    saveLessonNotes(lessonId, next)
      .then(() => {
        lastSaved.current = next;
        setStatus("saved");
      })
      .catch(() => setStatus("idle"));
  }

  function onChange(next: string) {
    setValue(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 900);
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-arcane-300" />
          <h3 className="text-[13px] font-medium text-white">Seu grimório</h3>
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            notas privadas
          </span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider">
          {status === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
              <span className="text-zinc-500">salvando</span>
            </>
          )}
          {status === "saved" && (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400/80">salvo</span>
            </>
          )}
          {status === "idle" && <span className="text-zinc-600">autosave</span>}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => persist(value)}
        placeholder="Anote insights, dúvidas, complexidades, links e o que você quer revisar depois. Ex.: 'Redis cache-aside: invalidação é o ponto difícil — TTL + versionamento.'"
        className="min-h-[140px] w-full resize-y bg-transparent px-5 py-4 text-[13px] leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-700"
      />
    </div>
  );
}
