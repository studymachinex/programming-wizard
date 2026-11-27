"use client";

import { useEffect, useState } from "react";
import { Lock, Mail, X } from "lucide-react";
import { TONE, mix } from "@/lib/scenes/iso";
import { FLOW_COLOR } from "./flows";
import type { Layer, LayerFile, LayerStack, LayersStage as LayersStageData, Status } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

const EXIT_MS = 400;
const INK = "#0d0a17";

type Item<T> = { item: T; ghost: boolean };

/** Mantém, por um instante, os itens removidos na posição em que estavam (logo após o vizinho anterior). */
function withGhosts<T extends { id: string }>(prev: T[] | undefined, next: T[], ghosts: boolean): Item<T>[] {
  const out: Item<T>[] = next.map((item) => ({ item, ghost: false }));
  if (!prev || !ghosts) return out;
  const ids = new Set(next.map((i) => i.id));
  let after = -1;
  for (const p of prev) {
    const at = out.findIndex((o) => !o.ghost && o.item.id === p.id);
    if (at >= 0) {
      after = at;
      continue;
    }
    if (!ids.has(p.id)) {
      out.splice(after + 1, 0, { item: p, ghost: true });
      after += 1;
    }
  }
  return out;
}

type Snapshot = { stage: LayersStageData; prev: LayersStageData | null; epoch: number; replay: boolean; ghosting: boolean };

/** Palco de camadas (HTML + CSS): pilhas em faixas (bands) ou em envelopes (nested). */
export function LayersStage({ stage, epoch, reduced, ariaLabel }: { stage: LayersStageData; epoch: number; reduced: boolean; ariaLabel: string }) {
  const [snap, setSnap] = useState<Snapshot>({ stage, prev: null, epoch, replay: false, ghosting: false });
  if (snap.stage !== stage || snap.epoch !== epoch) {
    const replay = epoch !== snap.epoch;
    setSnap({ stage, prev: replay ? null : snap.stage, epoch, replay, ghosting: !replay && !reduced });
  }
  useEffect(() => {
    if (!snap.ghosting) return;
    const t = setTimeout(() => setSnap((s) => (s === snap ? { ...s, ghosting: false } : s)), EXIT_MS);
    return () => clearTimeout(t);
  }, [snap]);

  const prevStacks = snap.prev?.stacks;
  const stacks = withGhosts(prevStacks, stage.stacks, snap.ghosting);
  const count = Math.min(3, Math.max(1, stacks.length));
  const prevIds = new Set(prevStacks?.map((s) => s.id));

  return (
    <div key={epoch} role="group" aria-label={ariaLabel} className="h-full w-full overflow-y-auto p-3 sm:p-5">
      <div className={cn("mx-auto grid gap-3 sm:gap-4", count === 1 ? "max-w-md grid-cols-1" : count === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
        {stacks.map(({ item: stack, ghost }) => {
          const before = prevStacks?.find((s) => s.id === stack.id);
          const stackNew = !ghost && !reduced && (snap.replay || (snap.prev !== null && !prevIds.has(stack.id)));
          return (
            <StackView
              key={stack.id}
              stack={stack}
              prevLayers={before?.layers}
              ghost={ghost}
              enter={stackNew}
              replay={snap.replay}
              ghosting={snap.ghosting && !ghost}
              reduced={reduced}
            />
          );
        })}
      </div>
      {(stage.wires?.length ?? 0) > 0 && (
        <div className="mx-auto mt-4 max-w-2xl space-y-2">
          {stage.wires!.map((w, i) => {
            const from = stage.stacks.find((s) => s.id === w.from);
            const to = stage.stacks.find((s) => s.id === w.to);
            const color = FLOW_COLOR[w.kind ?? "req"];
            return (
              <div key={i} className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
                <span className="w-24 shrink-0 truncate text-right">{from?.label}</span>
                <div className="relative h-5 flex-1">
                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed" style={{ borderColor: color }} />
                  {!reduced && (
                    <Mail className="absolute top-0.5 h-4 w-4" style={{ color, animation: "scene-envelope 2.2s linear infinite" }} />
                  )}
                  {w.label && <span className="absolute inset-x-0 -top-3 text-center text-[9px]" style={{ color }}>{w.label}</span>}
                </div>
                <span className="w-24 shrink-0 truncate">{to?.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StackView({
  stack,
  prevLayers,
  ghost,
  enter,
  replay,
  ghosting,
  reduced,
}: {
  stack: LayerStack;
  prevLayers?: Layer[];
  ghost: boolean;
  enter: boolean;
  replay: boolean;
  ghosting: boolean;
  reduced: boolean;
}) {
  const layers = withGhosts(prevLayers, stack.layers, ghosting);
  const isNewLayer = (l: Layer) => !ghost && !reduced && (replay || (prevLayers !== undefined && !prevLayers.some((p) => p.id === l.id)));
  return (
    <section
      className={cn("min-w-0 rounded-xl border border-white/[0.08] bg-ink-900/70 p-3", enter && "scene-layer-in", ghost && "scene-layer-out")}
      data-scene-stack={stack.id}
    >
      <h4 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-arcane-300">{stack.label}</h4>
      {stack.merged && stack.orientation === "bands" && (
        <div className="mb-2 rounded-lg border border-cyan-300/25 bg-cyan-400/[0.06] p-2">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-cyan-200/80">{stack.merged.label}</div>
          <div className="flex flex-wrap gap-1">
            {stack.merged.files.map((f) => {
              const src = stack.layers.find((l) => l.id === f.from);
              const c = TONE[src?.tone ?? "zinc"];
              return (
                <span
                  key={f.name}
                  className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ borderColor: mix(c.stroke, INK, 0.45), background: mix(c.top, INK, 0.82), color: c.stroke }}
                  title={`vem da camada: ${src?.label ?? f.from}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.top }} />
                  {f.name}
                  <span className="text-[8.5px] opacity-60">← {src?.label ?? f.from}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {stack.orientation === "bands" ? (
        <div className="space-y-1.5">
          {layers.map(({ item, ghost: g }) => (
            <Band key={item.id} layer={item} enter={isNewLayer(item)} exit={g} />
          ))}
        </div>
      ) : (
        <Nest items={layers} index={0} isNew={isNewLayer} />
      )}
    </section>
  );
}

const STATUS_RING: Partial<Record<Status, string>> = {
  hi: "ring-2 ring-arcane-400 shadow-[0_0_18px_-4px_rgba(167,139,250,0.6)]",
  new: "ring-1 ring-emerald-400/70 shadow-[0_0_16px_-4px_rgba(52,211,153,0.55)]",
  bad: "ring-1 ring-rose-400/80 shadow-[0_0_16px_-4px_rgba(251,113,133,0.55)]",
  warn: "ring-1 ring-amber-400/70",
  dead: "grayscale opacity-45",
  muted: "opacity-40",
};

function layerStyle(layer: Layer) {
  const c = TONE[layer.tone ?? "zinc"];
  return {
    borderColor: mix(c.stroke, INK, 0.55),
    borderLeftColor: c.top,
    background: mix(c.top, INK, 0.86),
  };
}

function Band({ layer, enter, exit }: { layer: Layer; enter: boolean; exit: boolean }) {
  return (
    <div
      data-scene-layer={layer.id}
      data-status={layer.status ?? "ok"}
      className={cn("relative rounded-lg border border-l-[3px] px-2.5 py-1.5 transition-[opacity,box-shadow] duration-500", STATUS_RING[layer.status ?? "ok"], enter && "scene-layer-in", exit && "scene-layer-out")}
      style={layerStyle(layer)}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 truncate text-[12px] font-medium text-white">{layer.label}</span>
        {layer.readonly && <Lock className="h-3 w-3 shrink-0 text-zinc-400" aria-label="somente leitura" />}
        {layer.status === "bad" && <X className="h-3.5 w-3.5 shrink-0 text-rose-300" aria-label="com falha" />}
        {layer.status === "new" && <span className="rounded bg-emerald-400/15 px-1 font-mono text-[8.5px] uppercase text-emerald-300">novo</span>}
        {layer.sub && <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-zinc-400">{layer.sub}</span>}
      </div>
      {layer.files && layer.files.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {layer.files.map((f) => (
            <Chip key={f.name} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}

const CHIP_TONE = {
  ok: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  warn: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  bad: "border-rose-400/50 bg-rose-400/10 text-rose-200",
  info: "border-sky-400/40 bg-sky-400/10 text-sky-200",
} as const;

function Chip({ file }: { file: LayerFile }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px]", file.tone ? CHIP_TONE[file.tone] : "border-white/10 bg-white/[0.04] text-zinc-300")}>
      {file.whiteout && <span className="mr-px text-zinc-500">.wh.</span>}
      <span className={file.whiteout ? "line-through decoration-rose-300/80" : undefined}>{file.name}</span>
    </span>
  );
}

/** Envelopes: cada layer é uma caixa que envolve a próxima; a primeira é a mais externa. */
function Nest({ items, index, isNew }: { items: Item<Layer>[]; index: number; isNew: (l: Layer) => boolean }) {
  const entry = items[index];
  if (!entry) return null;
  const { item: layer, ghost } = entry;
  return (
    <div
      data-scene-layer={layer.id}
      data-status={layer.status ?? "ok"}
      className={cn("rounded-lg border border-l-[3px] p-2 transition-[opacity,box-shadow] duration-500", STATUS_RING[layer.status ?? "ok"], isNew(layer) && "scene-nest-in", ghost && "scene-nest-out")}
      style={layerStyle(layer)}
    >
      <div className="scene-nest-head mb-1.5 flex items-center gap-1.5">
        <span className="text-[12px] font-medium text-white">{layer.label}</span>
        {layer.readonly && <Lock className="h-3 w-3 text-zinc-400" />}
        {layer.sub && <span className="ml-auto font-mono text-[10px] text-zinc-400">{layer.sub}</span>}
      </div>
      <Nest items={items} index={index + 1} isNew={isNew} />
    </div>
  );
}
