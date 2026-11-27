"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Info,
  Lightbulb,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Shapes,
} from "lucide-react";
import { computeChanges } from "@/lib/scenes/diff";
import type { Callout, SceneDef, SceneStep, StepKind } from "@/lib/scenes/types";
import { PanelView } from "@/components/visualizer/panels";
import { cn } from "@/lib/utils";
import { IsoStage } from "./iso-stage";
import { LayersStage } from "./layers-stage";
import { SceneTerminal } from "./scene-terminal";
import { SequenceStage, bracketKey, noteKey, rowsOf } from "./sequence-stage";
import { StepText } from "./step-text";

const KIND: Record<StepKind, { label: string; chip: string }> = {
  contexto: { label: "Contexto", chip: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300" },
  problema: { label: "Problema", chip: "border-rose-400/35 bg-rose-400/10 text-rose-300" },
  solucao: { label: "Solução", chip: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" },
  conceito: { label: "Conceito", chip: "border-arcane-400/40 bg-arcane-500/15 text-arcane-200" },
  tradeoff: { label: "Trade-off", chip: "border-amber-400/35 bg-amber-400/10 text-amber-300" },
  resumo: { label: "Resumo", chip: "border-cyan-400/35 bg-cyan-400/10 text-cyan-300" },
};

const CALLOUT: Record<Callout["kind"], { label: string; box: string; icon: typeof Info }> = {
  chave: { label: "Ideia-chave", box: "border-arcane-400/30 bg-arcane-500/10 text-arcane-100", icon: Lightbulb },
  atencao: { label: "Atenção", box: "border-rose-400/30 bg-rose-500/10 text-rose-100", icon: AlertTriangle },
  "bom-saber": { label: "Bom saber", box: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100", icon: Info },
};

const METRIC_TONE = { ok: "text-emerald-300", warn: "text-amber-300", bad: "text-rose-300" } as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function storageKey(track: string, lesson: string) {
  return `cena:${track}/${lesson}`;
}

function readProgress(track: string, lesson: string): number {
  try {
    const n = Number(window.localStorage.getItem(storageKey(track, lesson)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeProgress(track: string, lesson: string, value: number) {
  try {
    window.localStorage.setItem(storageKey(track, lesson), String(value));
  } catch {
    /* sem armazenamento: o progresso local simplesmente não persiste */
  }
}

function initialStep(total: number): { step: number; fromUrl: boolean } {
  const n = Number(new URLSearchParams(window.location.search).get("cena"));
  if (Number.isFinite(n) && n >= 1) return { step: Math.min(total, Math.floor(n)) - 1, fromUrl: true };
  return { step: 0, fromUrl: false };
}

function ariaOf(step: SceneStep): string {
  const stage = step.stage;
  if (stage.mode !== "iso") return `${step.title}. Diagrama animado da cena.`;
  const flagged = stage.entities.flatMap((e) => (e.type !== "zone" && e.label && (e.status === "bad" || e.status === "new" || e.status === "dead") ? [`${e.label} (${e.status === "bad" ? "com falha" : e.status === "new" ? "novo" : "fora do ar"})`] : []));
  return flagged.length ? `${step.title}. Destaques: ${flagged.join(", ")}.` : step.title;
}

export function ScenePlayer({ def, track, lesson }: { def: SceneDef; track: string; lesson: string }) {
  const total = def.steps.length;
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);

  const [init] = useState(() => initialStep(total));
  const [step, setStep] = useState(init.step);
  const [maxReached, setMaxReached] = useState(() => Math.max(readProgress(track, lesson), init.step + 1));
  const [epoch, setEpoch] = useState(0);
  const [replay, setReplay] = useState(false);
  const [paused, setPaused] = useState(false);
  const [fs, setFs] = useState(false);
  const [copied, setCopied] = useState(false);
  const visible = useRef(true);
  const touched = useRef(false);

  const current = def.steps[step];
  const changes = useMemo(() => computeChanges(step > 0 ? def.steps[step - 1] : null, current), [def, step, current]);

  // Ids de sequência já vistos em passos anteriores (mensagens ficam estáticas ao voltar a aparecer).
  const seenBefore = useMemo(() => {
    const out: Set<string>[] = [];
    const acc = new Set<string>();
    for (const s of def.steps) {
      out.push(new Set(acc));
      if (s.stage.mode === "sequence") {
        for (const m of s.stage.messages) acc.add(m.id);
        for (const n of s.stage.notes ?? []) acc.add(noteKey(n));
        for (const b of s.stage.brackets ?? []) acc.add(bracketKey(b));
      }
    }
    return out;
  }, [def]);
  const minRows = useMemo(() => Math.max(0, ...def.steps.map((s) => (s.stage.mode === "sequence" ? rowsOf(s.stage) : 0))), [def]);

  const goTo = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(total - 1, index));
      touched.current = true;
      setStep(next);
      setReplay(false);
    },
    [total],
  );

  // progresso local e URL
  useEffect(() => {
    const reached = Math.max(maxReached, step + 1);
    if (reached !== maxReached) setMaxReached(reached);
    writeProgress(track, lesson, reached);
  }, [step, maxReached, track, lesson]);

  useEffect(() => {
    if (!touched.current) return;
    const url = new URL(window.location.href);
    url.searchParams.set("cena", String(step + 1));
    window.history.replaceState(window.history.state, "", url);
  }, [step]);

  useEffect(() => {
    if (!init.fromUrl) return;
    const t = setTimeout(() => rootRef.current?.scrollIntoView({ block: "start", behavior: "auto" }), 250);
    return () => clearTimeout(t);
  }, [init.fromUrl]);

  // visibilidade (atalhos só valem com o player ao menos 40% visível)
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const viewport = entry.rootBounds?.height ?? window.innerHeight;
        visible.current = entry.intersectionRatio >= 0.4 || entry.intersectionRect.height >= viewport * 0.6;
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // tela cheia
  const toggleFs = useCallback(async () => {
    if (fs) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setFs(false);
      return;
    }
    setFs(true);
    try {
      await rootRef.current?.requestFullscreen?.();
    } catch {
      /* sem Fullscreen API: o overlay fixo cobre a tela */
    }
  }, [fs]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFs(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!fs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        setFs(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [fs]);

  const repeat = useCallback(() => {
    setEpoch((e) => e + 1);
    setReplay(true);
  }, []);

  // teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), .cm-editor")) return;
      if (!fs && !visible.current) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(step + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(step - 1);
      } else if (e.key === "r" || e.key === "R") {
        repeat();
      } else if (e.key === " ") {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !rootRef.current?.contains(active)) return;
        if (active.closest("button, a, input, select, textarea")) return;
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fs, step, goTo, repeat]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* área de transferência indisponível */
    }
  };

  const goToLesson = () => {
    const scroll = () => document.getElementById("conteudo-aula")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (fs) {
      void toggleFs().then(() => setTimeout(scroll, 60));
    } else scroll();
  };

  const mode = current.stage.mode;
  const nextStep = def.steps[step + 1];
  const last = step === total - 1;
  const kind = KIND[current.kind];
  const callout = current.callout ? CALLOUT[current.callout.kind] : null;
  const CalloutIcon = callout?.icon;

  const stageNode =
    mode === "iso" ? (
      <IsoStage stage={current.stage as Extract<SceneStep["stage"], { mode: "iso" }>} epoch={epoch} reduced={reduced} paused={paused} focus={current.focus} ariaLabel={ariaOf(current)} />
    ) : mode === "sequence" ? (
      <SequenceStage
        stage={current.stage as Extract<SceneStep["stage"], { mode: "sequence" }>}
        seen={seenBefore[step]}
        replay={replay}
        epoch={epoch}
        reduced={reduced}
        fit={fs}
        minRows={minRows}
        ariaLabel={ariaOf(current)}
      />
    ) : (
      <LayersStage stage={current.stage as Extract<SceneStep["stage"], { mode: "layers" }>} epoch={epoch} reduced={reduced} ariaLabel={ariaOf(current)} />
    );

  const iconBtn = "grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-ink-900/80 text-zinc-300 backdrop-blur transition-colors hover:border-arcane-400/50 hover:text-white sm:h-8 sm:w-8";

  const controls = (
    <>
      <button type="button" onClick={repeat} className={iconBtn} aria-label="Repetir animação do passo (R)" title="Repetir (R)">
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => setPaused((p) => !p)} className={iconBtn} aria-label={paused ? "Retomar animações (Espaço)" : "Pausar animações (Espaço)"} aria-pressed={paused} title="Pausar (Espaço)">
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={() => void toggleFs()} className={iconBtn} aria-label={fs ? "Sair da tela cheia (Esc)" : "Tela cheia"} title={fs ? "Sair da tela cheia (Esc)" : "Tela cheia"}>
        {fs ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </>
  );

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      aria-label={`Cena interativa: ${def.title}`}
      className={cn(
        "scene-root overflow-hidden border-arcane-400/20 bg-ink-850 outline-none",
        paused && "scene-paused",
        fs ? "fixed inset-0 z-[100] flex flex-col bg-ink-950 lg:flex-row" : "mt-8 rounded-2xl border bg-ink-850/60 shadow-card",
      )}
      data-scene-player
    >
      {/* coluna do palco */}
      <div className={cn("flex min-w-0 flex-col", fs && "h-[46vh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1")}>
        <header className="flex items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <Shapes className="h-3.5 w-3.5 shrink-0 text-arcane-300" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-arcane-300">Cena</div>
            <h3 className="truncate text-[14px] font-semibold text-white">{def.title}</h3>
          </div>
          {/* Controles sempre no cabeçalho: sobre o palco eles cobriam elementos da cena no celular. */}
          <div className="flex shrink-0 gap-1.5">{controls}</div>
        </header>

        {current.metrics && current.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 border-b border-white/[0.05] px-3 py-2 sm:flex sm:flex-wrap sm:px-4" aria-label="Métricas">
            {current.metrics.map((m) => (
              <div key={m.id} className="flex min-w-0 flex-col rounded-md border border-white/[0.07] bg-ink-900/70 px-2.5 py-1 sm:min-w-[104px]">
                <span className="truncate font-mono text-[9px] uppercase tracking-wider text-zinc-500">{m.label}</span>
                <span key={String(m.value)} className={cn("scene-metric-flash font-mono text-[13px] font-semibold", m.tone ? METRIC_TONE[m.tone] : "text-white")}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            "relative bg-grid-faint bg-[length:28px_28px] bg-[#0b0814]",
            fs ? "min-h-0 flex-1" : mode === "iso" ? "aspect-square sm:aspect-[16/10]" : "min-h-[240px]",
          )}
        >
          <div className={fs || mode === "iso" ? "absolute inset-0" : undefined}>{stageNode}</div>
        </div>

        {current.extra && current.extra.length > 0 && !fs && (
          <div className="space-y-5 border-t border-white/[0.06] p-4">
            {current.extra.map((panel, i) => (
              <PanelView key={i} panel={panel} />
            ))}
          </div>
        )}
      </div>

      {/* coluna do texto */}
      <div className={cn("min-w-0", fs && "min-h-0 flex-1 overflow-y-auto border-white/[0.08] lg:w-[360px] lg:flex-none lg:border-l")}>
        <div className={cn("grid gap-5 border-t border-white/[0.06] p-4 sm:p-5", !fs && "lg:grid-cols-[minmax(0,1fr)_230px]", fs && "border-t-0 lg:border-t-0")}>
          <div className="min-w-0" aria-live="polite">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Passo {step + 1} / {total}
              </span>
              <span className={cn("ml-auto rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider", kind.chip)}>{kind.label}</span>
            </div>
            <h4 className="text-[1.05rem] font-semibold leading-snug tracking-[-0.01em] text-white">{current.title}</h4>
            <div className="mt-2 space-y-2.5 text-[13.5px] leading-relaxed text-zinc-300">
              {current.body.map((p, i) => (
                <p key={i}>
                  <StepText text={p} />
                </p>
              ))}
            </div>
            {callout && CalloutIcon && current.callout && (
              <div className={cn("mt-3.5 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed", callout.box)}>
                <div className="mb-0.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] opacity-90">
                  <CalloutIcon className="h-3 w-3" /> {callout.label}
                </div>
                <StepText text={current.callout.text} />
              </div>
            )}
            {current.cmd && (
              <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-white/10 bg-[#07050d] px-3 py-2">
                <span className="select-none font-mono text-[12px] text-emerald-400">$</span>
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-zinc-100">{current.cmd}</code>
                <button type="button" onClick={() => void copy(current.cmd!)} className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-white">
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "copiado" : "copiar"}
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">O que mudou</div>
            {step === 0 ? (
              <p className="text-[12px] leading-snug text-zinc-600">Ponto de partida da cena.</p>
            ) : changes.length > 0 ? (
              <ul className="space-y-1">
                {changes.map((c) => {
                  // Uma coluna de marcador única: o sinal sai do texto.
                  const sign = c.startsWith("+") ? "+" : c.startsWith("−") ? "−" : "~";
                  const text = sign === "~" ? c : c.slice(1).trimStart();
                  return (
                    <li key={c} className="flex items-start gap-2 font-mono text-[11.5px] leading-snug text-zinc-300">
                      <span className={cn("w-3 shrink-0 text-center font-semibold", sign === "+" ? "text-emerald-300" : sign === "−" ? "text-rose-300" : "text-arcane-300")} aria-hidden>
                        {sign}
                      </span>
                      <span>{text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[12px] leading-snug text-zinc-600">O diagrama mudou de forma; veja o texto do passo.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 pb-4 sm:px-5">
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12.5px] text-zinc-300 transition-colors hover:border-arcane-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
          {last ? (
            <button type="button" onClick={goToLesson} className="flex items-center gap-1.5 rounded-lg bg-arcane-500 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-arcane-400">
              Ir para o texto da aula <ArrowDown className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="button" onClick={() => goTo(step + 1)} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-arcane-500 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-arcane-400">
              <span className="truncate">Próximo: {nextStep.nav}</span> <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
        </div>

        {/* trilha de passos */}
        <nav aria-label="Passos da cena" className="border-t border-white/[0.06] px-3 py-3 sm:px-4">
          <ol className="grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
            {def.steps.map((s, i) => {
              const done = i < step;
              const here = i === step;
              return (
                <li key={i} className="relative flex min-w-0 flex-col items-center">
                  {i > 0 && <span className={cn("absolute left-0 right-1/2 top-[11px] h-px", i <= step ? "bg-arcane-400/70" : "bg-white/10")} />}
                  {i < total - 1 && <span className={cn("absolute left-1/2 right-0 top-[11px] h-px", i < step ? "bg-arcane-400/70" : "bg-white/10")} />}
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={here ? "step" : undefined}
                    aria-label={`Passo ${i + 1}: ${s.nav}`}
                    className={cn(
                      "relative z-10 grid h-[22px] w-[22px] place-items-center rounded-full border font-mono text-[10px] transition-colors",
                      here ? "border-arcane-300 bg-arcane-500 text-white ring-2 ring-arcane-400/40 ring-offset-2 ring-offset-ink-850" : done ? "border-arcane-400/70 bg-arcane-500/70 text-white" : "border-white/20 bg-ink-900 text-zinc-500 hover:border-arcane-400/50 hover:text-zinc-200",
                    )}
                  >
                    {i + 1}
                  </button>
                  <span className={cn("mt-1.5 hidden w-full px-0.5 text-center text-[9px] leading-tight sm:block", here ? "text-zinc-200" : "text-zinc-500")}>{s.nav}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        {def.shell && <SceneTerminal def={def} step={current} stepIndex={step} />}

        <div className="border-t border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Você vai aprender</div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {def.goals.map((g) => {
              const reached = g.step <= Math.max(maxReached, step + 1);
              return (
                <li key={g.text} className={cn("flex items-start gap-2 text-[12.5px] leading-snug", reached ? "text-zinc-200" : "text-zinc-500")}>
                  <span className={cn("mt-px grid h-4 w-4 shrink-0 place-items-center rounded border", reached ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300" : "border-white/15")} aria-hidden>
                    {reached && <Check className="h-3 w-3" />}
                  </span>
                  <span>
                    {g.text}
                    <span className="sr-only">{reached ? " (concluído)" : " (pendente)"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
