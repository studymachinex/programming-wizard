"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Circle, Code2, Eye, Lightbulb, MessageSquare } from "lucide-react";
import { saveActivityCode, setActivityDone } from "@/app/actions";
import { CodeRunner } from "@/components/code-runner";
import { cn } from "@/lib/utils";

type CodeActivity = {
  id: string;
  title: string;
  starterCode: string;
  solutionCode: string;
  hints: string[];
  code: string;
  done: boolean;
  attempts: number;
};

export function ActivityCard({
  index,
  activity,
  statement,
  defaultOpen,
}: {
  index: number;
  activity: CodeActivity;
  statement: ReactNode;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [done, setDone] = useState(activity.done);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-ink-850/60", done ? "border-emerald-400/20" : "border-white/[0.08]")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02]" aria-expanded={open}>
        {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <Code2 className="h-4 w-4 shrink-0 text-arcane-300" />}
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Atividade {index}</span>
        <span className="flex-1 text-[14px] font-medium text-white">{activity.title}</span>
        {done && <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">concluída</span>}
        <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/[0.06] p-4">
          <div className="text-[14px]">{statement}</div>

          <CodeRunner
            target={{ kind: "activity", id: activity.id }}
            starterCode={activity.starterCode}
            initialCode={activity.code}
            solved={done}
            onSolved={() => setDone(true)}
            onSave={(code) => saveActivityCode(activity.id, code)}
            editorHeight="340px"
          />

          <div className="flex flex-wrap items-start gap-2">
            {activity.hints.length > 0 && (
              <button
                onClick={() => setHintsShown((n) => Math.min(n + 1, activity.hints.length))}
                disabled={hintsShown >= activity.hints.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 px-2.5 py-1.5 text-[12px] text-amber-200 hover:bg-amber-400/[0.06] disabled:opacity-40"
              >
                <Lightbulb className="h-3.5 w-3.5" /> {hintsShown === 0 ? "Ver uma dica" : hintsShown < activity.hints.length ? "Outra dica" : "Sem mais dicas"}
              </button>
            )}
            <button
              onClick={() => setShowSolution((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200"
            >
              <Eye className="h-3.5 w-3.5" /> {showSolution ? "Esconder solução" : "Ver solução"}
            </button>
          </div>
          {hintsShown > 0 && (
            <ol className="space-y-1.5">
              {activity.hints.slice(0, hintsShown).map((hint, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-amber-400/10 bg-amber-400/[0.04] px-3 py-2 text-[12.5px] text-zinc-300">
                  <span className="font-mono text-amber-300">{i + 1}.</span> {hint}
                </li>
              ))}
            </ol>
          )}
          {showSolution && (
            <div>
              {!done && <p className="mb-2 text-[12px] text-zinc-500">Vale tentar antes: entender a solução depois de travar ensina mais do que copiá-la.</p>}
              <pre className="max-h-[420px] overflow-auto rounded-xl border border-white/[0.07] bg-[#0a0712] p-4 font-mono text-[11.5px] leading-relaxed text-zinc-300">{activity.solutionCode}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReflectionList({ items }: { items: { id: string; title: string; done: boolean }[] }) {
  const [state, setState] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.done])));
  const [, startTransition] = useTransition();

  const toggle = (id: string) => {
    const next = !state[id];
    setState((s) => ({ ...s, [id]: next }));
    startTransition(async () => {
      await setActivityDone(id, next);
    });
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-ink-850/60 p-4">
      <div className="mb-1 flex items-center gap-2 text-[14px] font-medium text-white">
        <MessageSquare className="h-4 w-4 text-cyan-300" /> Autoavaliação
      </div>
      <p className="mb-3 text-[12.5px] text-zinc-400">Sem validador: explique em voz alta (ou por escrito, nas notas) e marque quando conseguir sem consultar.</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button onClick={() => toggle(item.id)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.03]" aria-pressed={state[item.id]}>
              {state[item.id] ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />}
              <span className={state[item.id] ? "text-zinc-400 line-through decoration-zinc-600" : "text-zinc-200"}>{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
