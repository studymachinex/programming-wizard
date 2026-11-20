"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Question = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export function LessonQuiz({ questions }: { questions: Question[] }) {
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  if (!questions?.length) return null;

  const answered = Object.keys(checked).length;
  const correct = questions.filter((q, i) => checked[i] && selected[i] === q.answer).length;
  const allDone = answered === questions.length;

  return (
    <div className="panel relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-arcane-500/[0.09] to-transparent" />
      <div className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-arcane-300" />
          <h3 className="text-[13px] font-medium text-white">Verifique seu entendimento</h3>
        </div>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
          {answered}/{questions.length} respondidas
        </span>
      </div>

      <div className="divide-y divide-white/[0.05]">
        {questions.map((q, qi) => {
          const chosen = selected[qi];
          const isChecked = checked[qi];
          const isCorrect = chosen === q.answer;
          return (
            <div key={qi} className="px-5 py-5">
              <p className="text-[13.5px] font-medium leading-relaxed text-zinc-200">
                <span className="mr-2 font-mono text-[10px] text-arcane-400/70">
                  {String(qi + 1).padStart(2, "0")}
                </span>
                {q.question}
              </p>
              <div className="mt-3 space-y-1.5">
                {q.options.map((option, oi) => {
                  const isSelected = chosen === oi;
                  const showCorrect = isChecked && oi === q.answer;
                  const showWrong = isChecked && isSelected && !isCorrect;
                  return (
                    <button
                      key={oi}
                      onClick={() => {
                        if (isChecked) return;
                        setSelected((s) => ({ ...s, [qi]: oi }));
                      }}
                      disabled={isChecked}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-all",
                        showCorrect && "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200",
                        showWrong && "border-rose-400/30 bg-rose-400/[0.08] text-rose-200",
                        !showCorrect &&
                          !showWrong &&
                          isSelected &&
                          "border-arcane-400/30 bg-arcane-500/[0.10] text-zinc-100",
                        !isSelected && !showCorrect && "border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:bg-white/[0.02]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border font-mono text-[8px]",
                          showCorrect && "border-emerald-400/50 text-emerald-300",
                          showWrong && "border-rose-400/50 text-rose-300",
                          !showCorrect && !showWrong && (isSelected ? "border-arcane-400/50 text-arcane-200" : "border-white/15 text-zinc-600")
                        )}
                      >
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {option}
                    </button>
                  );
                })}
              </div>

              {!isChecked ? (
                <button
                  onClick={() => setChecked((c) => ({ ...c, [qi]: true }))}
                  disabled={chosen === undefined}
                  className="mt-3 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-400 transition-colors hover:border-arcane-400/25 hover:text-arcane-200 disabled:opacity-40"
                >
                  conferir resposta
                </button>
              ) : (
                <div
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[11.5px] leading-relaxed",
                    isCorrect
                      ? "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200/90"
                      : "border-rose-400/20 bg-rose-400/[0.05] text-rose-200/90"
                  )}
                >
                  {isCorrect ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    <strong className="font-medium">{isCorrect ? "Correto. " : "Não exatamente. "}</strong>
                    {q.explanation}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            resultado: {correct}/{questions.length}
          </span>
          <button
            onClick={() => {
              setSelected({});
              setChecked({});
            }}
            className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-500 hover:text-arcane-300"
          >
            <RotateCcw className="h-3 w-3" /> tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}
