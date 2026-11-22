"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, Play, RotateCcw, Save, XCircle } from "lucide-react";
import { CodeEditor, type EditorDiagnostic } from "@/components/code-editor";
import { cn } from "@/lib/utils";

type TestResult = {
  name: string;
  display: string;
  status: "passed" | "failed" | "error" | "timeout";
  ms: number;
  message: string | null;
  output: string;
};
type RunResult =
  | { status: "passed" | "failed"; tests: TestResult[]; durationMs: number; compileMs: number }
  | { status: "compile_error"; diagnostics: { file: "solution" | "tests"; line: number; message: string }[]; raw: string; durationMs: number }
  | { status: "error"; message: string; durationMs: number };

/**
 * Editor + botão "Rodar testes" + painel de resultados. Usado nos exercícios e nas atividades
 * das aulas. Os testes rodam no servidor (POST /api/run) e passar em todos marca como resolvido.
 */
export function CodeRunner({
  target,
  starterCode,
  initialCode,
  solved: initiallySolved,
  onSolved,
  onSave,
  editorHeight = "420px",
  fileName = "Solution.java",
}: {
  target: { kind: "exercise" | "activity"; id: string };
  starterCode: string;
  initialCode?: string;
  solved?: boolean;
  onSolved?: () => void;
  onSave?: (code: string) => Promise<unknown>;
  editorHeight?: string;
  fileName?: string;
}) {
  const [code, setCode] = useState(initialCode || starterCode);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [solved, setSolved] = useState(Boolean(initiallySolved));
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [open, setOpen] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, code }),
      });
      const data = await response.json();
      if (!response.ok) {
        setRequestError(data.error ?? "Falha ao rodar os testes.");
        return;
      }
      setResult(data.result);
      if (data.result.status !== "passed" && data.result.status !== "failed") setOpen(null);
      else setOpen(data.result.tests.find((t: TestResult) => t.status !== "passed")?.name ?? null);
      if (data.solved && !solved) {
        setSolved(true);
        onSolved?.();
      }
    } catch {
      setRequestError("Não consegui falar com o servidor. Ele está rodando?");
    } finally {
      setRunning(false);
    }
  }, [running, target, code, solved, onSolved]);

  const save = useCallback(async () => {
    if (!onSave) return;
    setSaved("saving");
    await onSave(code).catch(() => {});
    setSaved("saved");
    setTimeout(() => setSaved("idle"), 1800);
  }, [onSave, code]);

  const reset = () => {
    if (code !== starterCode && !window.confirm("Descartar seu código e voltar ao modelo inicial?")) return;
    setCode(starterCode);
    setResult(null);
  };

  const diagnostics: EditorDiagnostic[] = useMemo(
    () => (result?.status === "compile_error" ? result.diagnostics.filter((d) => d.file === "solution") : []),
    [result],
  );

  const passed = result && "tests" in result ? result.tests.filter((t) => t.status === "passed").length : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-arcane-400/15 bg-[#0a0712] shadow-card">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{fileName}</span>
          <span className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-600">Java 21</span>
          {solved && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> resolvido
            </span>
          )}
        </div>
        <span className="font-mono text-[9px] text-zinc-600">Ctrl+Enter roda · Ctrl+S salva</span>
      </div>

      <CodeEditor value={code} onChange={setCode} onRun={run} onSave={onSave ? save : undefined} diagnostics={diagnostics} height={editorHeight} />

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] bg-white/[0.015] px-4 py-2.5">
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-arcane-500 px-3.5 py-2 text-[12px] font-medium text-white transition-colors hover:bg-arcane-400 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Rodando..." : "Rodar testes"}
        </button>
        {onSave && (
          <button onClick={save} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-300 hover:border-arcane-400/25 hover:text-white">
            <Save className="h-3.5 w-3.5" /> {saved === "saving" ? "Salvando..." : saved === "saved" ? "Salvo" : "Salvar"}
          </button>
        )}
        <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-400 hover:text-zinc-200">
          <RotateCcw className="h-3.5 w-3.5" /> Recomeçar
        </button>
        {result && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-zinc-500">
            <Clock className="h-3 w-3" /> {(result.durationMs / 1000).toFixed(1)} s
          </span>
        )}
      </div>

      {(result || requestError) && (
        <div className="border-t border-white/[0.07] bg-[#0b0814]" aria-live="polite">
          {requestError && <p className="px-4 py-3 text-[12.5px] text-rose-300">{requestError}</p>}

          {result?.status === "compile_error" && (
            <div className="px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-medium text-rose-300">
                <XCircle className="h-4 w-4" /> Não compilou
              </p>
              {result.diagnostics.some((d) => d.file === "tests") && (
                <p className="mt-1 text-[12px] text-zinc-400">
                  Os testes não compilam contra o seu código: confira nomes, assinaturas e tipos de retorno pedidos no enunciado.
                </p>
              )}
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-300">{result.raw}</pre>
            </div>
          )}

          {result?.status === "error" && (
            <div className="px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-medium text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Não foi possível rodar
              </p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] text-zinc-400">{result.message}</pre>
            </div>
          )}

          {result && "tests" in result && (
            <div>
              <div className={cn("flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium", result.status === "passed" ? "text-emerald-300" : "text-rose-300")}>
                {result.status === "passed" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {passed}/{result.tests.length} testes passaram
                {result.status === "passed" && <span className="font-normal text-zinc-400">— tudo certo!</span>}
              </div>
              <ul className="divide-y divide-white/[0.04] border-t border-white/[0.05]">
                {result.tests.map((test) => {
                  const ok = test.status === "passed";
                  const expanded = open === test.name;
                  const hasDetail = Boolean(test.message || test.output);
                  return (
                    <li key={test.name}>
                      <button
                        onClick={() => setOpen(expanded ? null : test.name)}
                        disabled={!hasDetail}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12.5px] hover:bg-white/[0.02] disabled:cursor-default"
                      >
                        {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : test.status === "timeout" ? <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                        <span className={cn("flex-1", ok ? "text-zinc-300" : "text-zinc-100")}>{test.display}</span>
                        <span className="font-mono text-[10px] text-zinc-600">{test.ms} ms</span>
                        {hasDetail && <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-600 transition-transform", expanded && "rotate-180")} />}
                      </button>
                      {expanded && hasDetail && (
                        <div className="space-y-2 px-4 pb-3 pl-10">
                          {test.message && <pre className="whitespace-pre-wrap rounded-lg border border-rose-400/15 bg-rose-500/[0.05] p-2.5 font-mono text-[11.5px] leading-relaxed text-rose-100">{test.message}</pre>}
                          {test.output && (
                            <div>
                              <div className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">saída (System.out)</div>
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 p-2.5 font-mono text-[11.5px] text-zinc-300">{test.output}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
