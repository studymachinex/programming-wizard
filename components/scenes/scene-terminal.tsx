"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eraser, TerminalSquare } from "lucide-react";
import { normalizeCommand, resolveCommand } from "@/lib/scenes/terminal";
import type { SceneDef, SceneStep } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

type Entry = { kind: "cmd"; text: string } | { kind: "out"; text: string; known: boolean } | { kind: "sep"; text: string };

/** Terminal simulado: as respostas vêm do diagrama do passo atual, não de um sistema real. */
export function SceneTerminal({ def, step, stepIndex }: { def: SceneDef; step: SceneStep; stepIndex: number }) {
  const [open, setOpen] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(min-width: 640px)").matches : true));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const lastStep = useRef(stepIndex);

  // Separador "— Passo N · nav —" a cada troca de passo (o histórico persiste entre passos).
  useEffect(() => {
    if (lastStep.current === stepIndex) return;
    lastStep.current = stepIndex;
    const text = `— Passo ${stepIndex + 1} · ${step.nav} —`;
    setEntries((list) => {
      if (list.length === 0) return list;
      const last = list[list.length - 1];
      return last.kind === "sep" ? [...list.slice(0, -1), { kind: "sep", text }] : [...list, { kind: "sep", text }];
    });
  }, [stepIndex, step.nav]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, open]);

  const run = (raw: string) => {
    const cmd = normalizeCommand(raw);
    if (!cmd) return;
    history.current.push(cmd);
    cursor.current = history.current.length;
    if (cmd === "clear") {
      setEntries([]);
      return;
    }
    const result = resolveCommand(cmd, step, def);
    setEntries((list) => {
      const next: Entry[] = [...list];
      if (next.length === 0 || next[next.length - 1].kind !== "sep") {
        if (next.length === 0) next.push({ kind: "sep", text: `— Passo ${stepIndex + 1} · ${step.nav} —` });
      }
      next.push({ kind: "cmd", text: cmd });
      if (result.output) next.push({ kind: "out", text: result.output, known: result.known });
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      run(input);
      setInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.current.length === 0) return;
      cursor.current = Math.max(0, cursor.current - 1);
      setInput(history.current[cursor.current] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (history.current.length === 0) return;
      cursor.current = Math.min(history.current.length, cursor.current + 1);
      setInput(history.current[cursor.current] ?? "");
    }
  };

  return (
    <div className="border-t border-white/[0.06]" data-scene-terminal>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-400 hover:text-white sm:px-5"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <TerminalSquare className="h-3.5 w-3.5 text-arcane-300" />
        Terminal (simulado)
      </button>
      {open && (
        <div className="px-4 pb-4 sm:px-5">
          <p className="mb-2 rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-amber-100/90">
            Terminal simulado para estudo: as respostas vêm do diagrama deste passo, não de um cluster real. Nomes, IPs e tempos podem diferir do que você verá.
          </p>
          {(step.terminal?.suggest.length ?? 0) > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Experimente:</span>
              {step.terminal!.suggest.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => run(cmd)}
                  className="max-w-full truncate rounded-md border border-arcane-400/25 bg-arcane-500/[0.08] px-2 py-1 font-mono text-[11px] text-arcane-100 hover:border-arcane-400/60 hover:bg-arcane-500/20"
                >
                  {cmd}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#07050d]">
            <div ref={scroller} className="max-h-[280px] overflow-y-auto overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed" aria-live="polite">
              {entries.length === 0 && <div className="text-zinc-600">Digite um comando ou clique numa sugestão. Use help para ver o que dá para rodar aqui.</div>}
              {entries.map((e, i) =>
                e.kind === "sep" ? (
                  <div key={i} className="my-1.5 text-center text-[10px] uppercase tracking-wider text-zinc-600">
                    {e.text}
                  </div>
                ) : e.kind === "cmd" ? (
                  <div key={i} className="whitespace-pre text-zinc-100">
                    <span className="select-none text-emerald-400">$ </span>
                    {e.text}
                  </div>
                ) : (
                  <div key={i} className={cn("whitespace-pre", e.known ? "text-zinc-400" : "text-amber-300/90")}>
                    {e.text}
                  </div>
                ),
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-white/[0.07] px-3 py-1.5">
              <span className="select-none font-mono text-[12px] text-emerald-400">$</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Comando do terminal simulado"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="help"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-zinc-100 outline-none placeholder:text-zinc-700"
              />
              <button type="button" onClick={() => setEntries([])} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200">
                <Eraser className="h-3 w-3" /> limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
