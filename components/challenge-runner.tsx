"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FolderPlus,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  Terminal,
  XCircle,
} from "lucide-react";
import {
  refreshChallengeAction,
  restartChallengeAction,
  startChallengeAction,
  submitChallengeAction,
  testChallengeAction,
} from "@/app/codecrafters-actions";
import { cn } from "@/lib/utils";

type Kind = "start" | "test" | "submit" | "refresh" | "restart";

export function ChallengeRunner({
  slug,
  hasWorkspace,
  completed,
  total,
}: {
  slug: string;
  hasWorkspace: boolean;
  completed: number;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<Kind | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [output]);

  function run(nextKind: Kind) {
    setKind(nextKind);
    setOk(null);
    setOutput(null);
    startTransition(async () => {
      const action = {
        start: startChallengeAction,
        test: testChallengeAction,
        submit: submitChallengeAction,
        refresh: refreshChallengeAction,
        restart: restartChallengeAction,
      }[nextKind];
      const result = await action(slug);
      setOutput(result.output);
      setOk(result.ok);
      setKind(null);
      router.refresh();
    });
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-arcane-300" />
          <p className="text-[12px] font-medium text-white">Runner</p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {completed}/{total} stages
        </span>
      </div>

      <div className="space-y-2 p-4">
        {!hasWorkspace ? (
          <button
            onClick={() => run("start")}
            disabled={pending}
            className="btn-primary w-full py-2 text-[12px]"
          >
            {pending && kind === "start" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderPlus className="h-3.5 w-3.5" />
            )}
            Criar workspace do desafio
          </button>
        ) : (
          <>
            <button
              onClick={() => run("test")}
              disabled={pending}
              className="btn-secondary w-full py-2 text-[12px]"
              title="Roda os testes localmente sem commitar nem avançar o stage"
            >
              {pending && kind === "test" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Rodar testes
            </button>
            <button
              onClick={() => run("submit")}
              disabled={pending}
              className="btn-primary w-full py-2 text-[12px]"
              title="Commit + git push para o remote wizard; o hook post-receive roda os testes"
            >
              {pending && kind === "submit" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5" />
              )}
              Submeter stage
            </button>
            <button
              onClick={() => run("refresh")}
              disabled={pending}
              className="btn-ghost w-full py-1.5 text-[11px]"
            >
              <RefreshCw className={cn("h-3 w-3", pending && kind === "refresh" && "animate-spin")} />
              Atualizar progresso
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Recomeçar apaga o código do workspace e zera o progresso. Continuar?"
                  )
                ) {
                  run("restart");
                }
              }}
              disabled={pending}
              className="flex w-full items-center justify-center gap-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-700 transition-colors hover:text-rose-300/80"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              recomeçar do zero
            </button>
          </>
        )}
      </div>

      {output && (
        <div className="border-t border-white/[0.06]">
          <div className="flex items-center justify-between px-4 py-2">
            <span
              className={cn(
                "flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider",
                ok ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {kind === "submit" ? "submissão" : kind === "start" ? "workspace" : "resultado"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-700">
              wizard
            </span>
          </div>
          <div
            ref={terminalRef}
            className="max-h-72 overflow-auto border-t border-white/[0.05] bg-[#08060f] px-4 py-3 font-mono text-[10.5px] leading-relaxed text-zinc-400"
          >
            <pre className="whitespace-pre-wrap break-words">{output}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
