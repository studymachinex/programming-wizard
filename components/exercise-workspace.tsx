"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Lightbulb, Terminal } from "lucide-react";
import { saveExerciseCode } from "@/app/actions";
import { CodeRunner } from "@/components/code-runner";
import { cn } from "@/lib/utils";

export function ExerciseWorkspace({
  exerciseId,
  starterCode,
  solutionCode,
  tests,
  hints,
  initialCode,
  solved,
}: {
  exerciseId: string;
  starterCode: string;
  solutionCode: string;
  tests: string;
  hints: string[];
  initialCode: string;
  solved: boolean;
  attempts?: number;
}) {
  const [tab, setTab] = useState<"dicas" | "testes" | "solucao">("dicas");
  const [showSolution, setShowSolution] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copySolution() {
    try {
      await navigator.clipboard.writeText(solutionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <CodeRunner
        target={{ kind: "exercise", id: exerciseId }}
        starterCode={starterCode}
        initialCode={initialCode}
        solved={solved}
        onSave={(code) => saveExerciseCode(exerciseId, code)}
      />

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
                Estes são os testes que rodam quando você clica em "Rodar testes". Passar em todos
                marca o exercício como resolvido.
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
