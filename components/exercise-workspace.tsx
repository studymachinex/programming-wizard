"use client";

import { useRef, useState, useTransition } from "react";
import { Check, CheckCircle2, Copy, Eye, EyeOff, Lightbulb, Loader2, Play, Save, Terminal } from "lucide-react";
import { saveExerciseCode, setExerciseSolved } from "@/app/actions";
import { cn } from "@/lib/utils";

export function ExerciseWorkspace({
  exerciseId,
  starterCode,
  solutionCode,
  tests,
  hints,
  initialCode,
  solved,
  attempts,
}: {
  exerciseId: string;
  starterCode: string;
  solutionCode: string;
  tests: string;
  hints: string[];
  initialCode: string;
  solved: boolean;
  attempts: number;
}) {
  const [code, setCode] = useState(initialCode || starterCode);
  const [isSolved, setSolved] = useState(solved);
  const [attemptCount, setAttemptCount] = useState(attempts);
  const [tab, setTab] = useState<"dicas" | "testes" | "solucao">("dicas");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showSolution, setShowSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function save(showFeedback = true) {
    setStatus("saving");
    setAttemptCount((n) => n + 1);
    saveExerciseCode(exerciseId, code)
      .then(() => {
        setStatus("saved");
        if (!showFeedback) return;
        setTimeout(() => setStatus("idle"), 2200);
      })
      .catch(() => setStatus("idle"));
  }

  function toggleSolved() {
    const next = !isSolved;
    setSolved(next);
    startTransition(async () => {
      await setExerciseSolved(exerciseId, next);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${code.slice(0, start)}    ${code.slice(end)}`;
      setCode(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      });
    }
  }

  async function copySolution() {
    try {
      await navigator.clipboard.writeText(solutionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const lines = code.split("\n").length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-arcane-400/15 bg-[#0a0712] shadow-card">
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <Terminal className="h-3 w-3 text-arcane-400/70" /> Solution.java
            </span>
            <span className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-600">
              Java 21
            </span>
          </div>
          <div className="flex items-center gap-3">
            {status === "saving" && (
              <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-500">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> salvando
              </span>
            )}
            {status === "saved" && (
              <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
                <Check className="h-2.5 w-2.5" /> salvo
              </span>
            )}
            <span className="font-mono text-[9px] text-zinc-600">{attemptCount} tentativas</span>
          </div>
        </div>

        <div className="relative flex">
          <div className="select-none border-r border-white/[0.05] bg-white/[0.012] px-2 py-4 text-right font-mono text-[11px] leading-[1.7] text-zinc-700">
            {Array.from({ length: Math.max(lines, 14) }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setStatus("idle");
            }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            className="h-[420px] w-full resize-y bg-transparent p-4 font-mono text-[12.5px] leading-[1.7] text-zinc-200 outline-none placeholder:text-zinc-700"
            placeholder="Escreva sua solução em Java..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] bg-white/[0.015] px-4 py-3">
          <button
            onClick={() => save()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-zinc-300 transition-colors hover:border-arcane-400/25 hover:text-white"
          >
            <Save className="h-3.5 w-3.5" /> Salvar código
            <span className="ml-1 font-mono text-[8.5px] text-zinc-600">Ctrl+S</span>
          </button>
          <button
            onClick={toggleSolved}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors disabled:opacity-60",
              isSolved
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                : "border-arcane-400/40 bg-arcane-500 text-white hover:bg-arcane-400"
            )}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {isSolved ? "Resolvido" : "Marcar como resolvido"}
          </button>
          <button
            onClick={() => save()}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-400 transition-colors hover:border-mana/25 hover:text-mana"
          >
            <Play className="h-3.5 w-3.5" /> Registrar tentativa
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel overflow-hidden">
        <div className="flex border-b border-white/[0.06]">
          {(
            [
              ["dicas", "Dicas", Lightbulb],
              ["testes", "Testes", Terminal],
              ["solucao", "Solução", Eye],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 px-4 py-3 font-mono text-[9.5px] uppercase tracking-wider transition-colors",
                tab === key
                  ? "border-b-2 border-arcane-400 bg-arcane-500/[0.06] text-arcane-200"
                  : "border-b-2 border-transparent text-zinc-600 hover:text-zinc-300"
              )}
            >
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "dicas" && (
            <div className="space-y-3">
              {hints.map((hint, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-amber-400/25 bg-amber-400/10 font-mono text-[9px] text-amber-300">
                    {i + 1}
                  </span>
                  <p className="text-[12.5px] leading-relaxed text-zinc-400">{hint}</p>
                </div>
              ))}
              <p className="pt-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                tente 20 minutos antes de abrir a solução
              </p>
            </div>
          )}

          {tab === "testes" && (
            <div>
              <p className="mb-3 text-[12px] leading-relaxed text-zinc-500">
                Estes são os testes que sua solução precisa passar. Cole no seu projeto local ou crie
                os casos manualmente no seu IDE.
              </p>
              <pre className="hljs max-h-[360px] overflow-auto rounded-xl border border-white/[0.07] bg-[#0a0712] p-4 font-mono text-[11.5px] leading-relaxed text-zinc-300">
                {tests}
              </pre>
            </div>
          )}

          {tab === "solucao" && (
            <div>
              {!showSolution ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <EyeOff className="h-5 w-5 text-zinc-600" />
                  <p className="mt-3 text-[12.5px] text-zinc-400">
                    A solução só aparece depois de uma tentativa honesta.
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Você ainda pode aprender com ela — mas tente primeiro.
                  </p>
                  <button
                    onClick={() => setShowSolution(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-zinc-300 hover:border-ember/25 hover:text-ember"
                  >
                    <Eye className="h-3.5 w-3.5" /> Revelar solução comentada
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                      solução de referência
                    </p>
                    <button
                      onClick={copySolution}
                      className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      {copied ? "copiado" : "copiar"}
                    </button>
                  </div>
                  <pre className="hljs max-h-[420px] overflow-auto rounded-xl border border-white/[0.07] bg-[#0a0712] p-4 font-mono text-[11.5px] leading-relaxed text-zinc-300">
                    {solutionCode}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
