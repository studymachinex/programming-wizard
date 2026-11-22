"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play, Shuffle, Sparkles } from "lucide-react";
import { loadVisualizer } from "@/lib/visualizers/registry";
import type { Frame, Scenario, VisualizerDef } from "@/lib/visualizers/types";
import { cn } from "@/lib/utils";
import { PanelView } from "./panels";

const SPEEDS = [
  { label: "0,5×", ms: 1600 },
  { label: "1×", ms: 900 },
  { label: "2×", ms: 450 },
  { label: "4×", ms: 200 },
];

/** Carrega o visualizador da aula (se existir) e o exibe. */
export function LessonVisualizer({ track, lesson }: { track: string; lesson: string }) {
  const [def, setDef] = useState<VisualizerDef | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    // Uma nova tentativa cobre falhas transitórias ao baixar o chunk (deploy, recompilação).
    const load = (attempt: number): Promise<void> =>
      loadVisualizer(track, lesson).then(
        (loaded) => {
          if (alive) setDef(loaded);
        },
        (error) => {
          if (attempt < 2) return new Promise<void>((r) => setTimeout(r, 800)).then(() => load(attempt + 1));
          console.error("[visualizador] falha ao carregar", error);
          if (alive) setDef(null);
        },
      );
    load(1);
    return () => {
      alive = false;
    };
  }, [track, lesson]);

  if (def === undefined) {
    return <div className="mt-8 h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-ink-850/40" />;
  }
  if (!def) return null;
  return <Visualizer def={def} />;
}

function Visualizer({ def }: { def: VisualizerDef }) {
  const [scenarios, setScenarios] = useState<Scenario[]>(def.scenarios);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const frames: Frame[] = useMemo(() => {
    try {
      return scenarios[scenarioIndex].build();
    } catch (error) {
      console.error("[visualizador]", error);
      return [{ caption: "Não foi possível gerar este cenário.", panels: [] }];
    }
  }, [scenarios, scenarioIndex]);

  const last = frames.length - 1;
  const frame = frames[Math.min(step, last)];

  // ?passo=N abre direto num passo (útil para compartilhar um ponto da animação).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const passo = Number(params.get("passo"));
    const cenario = Number(params.get("cenario"));
    if (cenario > 0 && cenario <= def.scenarios.length) setScenarioIndex(cenario - 1);
    if (passo > 0) setStep(passo - 1);
  }, [def]);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((s) => Math.min(s + 1, last)), SPEEDS[speed].ms);
    return () => clearTimeout(timer);
  }, [playing, step, last, speed]);

  const choose = useCallback((index: number) => {
    setScenarioIndex(index);
    setStep(0);
    setPlaying(false);
  }, []);

  const randomize = () => {
    if (!def.random) return;
    const fresh = def.random();
    const next = [...def.scenarios, fresh];
    setScenarios(next);
    choose(next.length - 1);
  };

  const togglePlay = () => {
    if (step >= last) setStep(0);
    setPlaying((p) => !p);
  };

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-arcane-400/20 bg-ink-850/60 shadow-card" aria-label={`Visualizador: ${def.title}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <Sparkles className="h-3.5 w-3.5 text-arcane-300" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-arcane-300">Visualizador</div>
          <div className="truncate text-[14px] font-semibold text-white">{def.title}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scenarioIndex}
            onChange={(e) => choose(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-ink-900 px-2 py-1 font-mono text-[11px] text-zinc-300"
            aria-label="Cenário"
          >
            {scenarios.map((s, i) => (
              <option key={i} value={i}>
                {s.label}
              </option>
            ))}
          </select>
          {def.random && (
            <button onClick={randomize} className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:border-arcane-400/40 hover:text-white">
              <Shuffle className="h-3 w-3" /> Aleatório
            </button>
          )}
        </div>
      </header>

      <p className="border-b border-white/[0.04] px-4 py-2.5 text-[12.5px] leading-relaxed text-zinc-400">{def.summary}</p>

      <div>
        <div className="min-w-0 space-y-5 p-4">
          {frame.panels.map((panel, i) => (
            <PanelView key={i} panel={panel} />
          ))}
        </div>
        {def.code && (
          <pre className="m-0 overflow-x-auto border-t border-white/[0.06] bg-[#0b0814] p-3 font-mono text-[11.5px] leading-[1.7]">
            {def.code.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "-mx-3 whitespace-pre-wrap break-words px-3 pl-6 -indent-3 transition-colors",
                  frame.line === i ? "bg-arcane-500/20 text-white shadow-[inset_2px_0_0_#a78bfa]" : "text-zinc-500",
                )}
              >
                {line || " "}
              </div>
            ))}
          </pre>
        )}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-3">
        <p className="min-h-[2.6em] text-[13px] leading-relaxed text-zinc-200" aria-live="polite">
          {frame.caption}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ControlButton label="Início" onClick={() => { setPlaying(false); setStep(0); }} disabled={step === 0}>
            <ChevronFirst className="h-4 w-4" />
          </ControlButton>
          <ControlButton label="Passo anterior" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" />
          </ControlButton>
          <button
            onClick={togglePlay}
            className="flex items-center gap-1.5 rounded-lg bg-arcane-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-arcane-400"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pausar" : step >= last ? "Repetir" : "Executar"}
          </button>
          <ControlButton label="Próximo passo" onClick={() => { setPlaying(false); setStep((s) => Math.min(last, s + 1)); }} disabled={step >= last}>
            <ChevronRight className="h-4 w-4" />
          </ControlButton>
          <ControlButton label="Fim" onClick={() => { setPlaying(false); setStep(last); }} disabled={step >= last}>
            <ChevronLast className="h-4 w-4" />
          </ControlButton>
          <input
            type="range"
            min={0}
            max={last}
            value={Math.min(step, last)}
            onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
            className="mx-2 min-w-[120px] flex-1 accent-arcane-400"
            aria-label="Passo"
          />
          <span className="font-mono text-[11px] text-zinc-500">
            {Math.min(step, last) + 1}/{frames.length}
          </span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-ink-900 px-1.5 py-1 font-mono text-[11px] text-zinc-300"
            aria-label="Velocidade"
          >
            {SPEEDS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function ControlButton({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg border border-white/10 p-1.5 text-zinc-300 hover:border-arcane-400/40 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
