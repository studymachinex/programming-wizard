"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  BADGE_H,
  BOX_SIZE,
  ICONS,
  STATUS_STROKE,
  TH,
  TONE,
  TW,
  USERS_CELL,
  USERS_PLATFORM_TH,
  ZONE_TH,
  anchorOf,
  badgeWidth,
  boxStack,
  bounds,
  defaultFocus,
  focusBounds,
  flowGeometries,
  labelWidth,
  linkLabelWidth,
  originOf,
  zoneLabelPos,
  project,
  resolveEntities,
  usersLayout,
  zoneColors,
  type Resolved,
} from "@/lib/scenes/iso";
import type { Badge, IsoBox, IsoStage as IsoStageData, IsoUsers, IsoZone, Status } from "@/lib/scenes/types";
import { Flows, type FlowPath } from "./flows";

const MARGIN = 20;
const CAMERA_MS = 500;
const EXIT_MS = 400;

const BADGE_COLORS = {
  ok: { bg: "#0f3d2f", fg: "#6ee7b7", line: "#34d399" },
  warn: { bg: "#4a3410", fg: "#fcd34d", line: "#f59e0b" },
  bad: { bg: "#4c1527", fg: "#fda4af", line: "#fb7185" },
  info: { bg: "#241c3d", fg: "#c4b2ff", line: "#6d5bb5" },
} as const;

type Snapshot = {
  stage: IsoStageData;
  epoch: number;
  entering: Set<string>;
  ghosts: Resolved[];
  newLinks: Set<string>;
};

const linkKey = (l: { from: string; to: string }) => `${l.from}>${l.to}`;

function nextSnapshot(prev: Snapshot, stage: IsoStageData, epoch: number, reduced: boolean): Snapshot {
  const replay = epoch !== prev.epoch;
  const before = resolveEntities(prev.stage.entities);
  const after = resolveEntities(stage.entities);
  const entering = new Set<string>();
  for (const id of after.keys()) if (replay || !before.has(id)) entering.add(id);
  const ghosts: Resolved[] = [];
  if (!replay && !reduced) for (const [id, r] of before) if (!after.has(id)) ghosts.push(r);
  const prevLinks = new Set((prev.stage.links ?? []).map(linkKey));
  const newLinks = new Set<string>();
  for (const l of stage.links ?? []) if (replay || !prevLinks.has(linkKey(l))) newLinks.add(linkKey(l));
  return { stage, epoch, entering, ghosts, newLinks };
}

/** Palco isométrico: elementos animados por id, câmera suave e fluxos de partículas. */
export function IsoStage({
  stage,
  epoch,
  reduced,
  paused,
  focus,
  ariaLabel,
}: {
  stage: IsoStageData;
  epoch: number;
  reduced: boolean;
  paused: boolean;
  focus?: string[];
  ariaLabel: string;
}) {
  const [snap, setSnap] = useState<Snapshot>(() => ({ stage, epoch, entering: new Set(), ghosts: [], newLinks: new Set() }));
  // Estado derivado das props: recalcula entradas, saídas e links novos sem um quadro de atraso.
  if (snap.stage !== stage || snap.epoch !== epoch) setSnap(nextSnapshot(snap, stage, epoch, reduced));

  useEffect(() => {
    if (!snap.ghosts.length) return;
    const t = setTimeout(() => setSnap((s) => (s === snap ? { ...s, ghosts: [] } : s)), EXIT_MS);
    return () => clearTimeout(t);
  }, [snap]);

  const resolved = useMemo(() => resolveEntities(stage.entities), [stage]);
  const full = useMemo(() => {
    const b = bounds(stage);
    return [b.minX - MARGIN, b.minY - MARGIN, b.maxX - b.minX + MARGIN * 2, b.maxY - b.minY + MARGIN * 2] as const;
  }, [stage]);
  const focusView = useMemo(() => {
    const ids = focus ?? defaultFocus(stage);
    const b = ids ? focusBounds(stage, ids) : null;
    return b ? ([b.minX - MARGIN, b.minY - MARGIN, b.maxX - b.minX + MARGIN * 2, b.maxY - b.minY + MARGIN * 2] as const) : null;
  }, [stage, focus]);

  // Escala renderizada do diagrama inteiro; abaixo de 0,7 a câmera enquadra só o foco (com botão para alternar).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fullScale = box.w > 0 && box.h > 0 ? Math.min(box.w / full[2], box.h / full[3]) : 1;
  const canZoom = focusView !== null && fullScale < 0.7;
  const [zoomed, setZoomed] = useState(true);
  const target = canZoom && zoomed && focusView ? focusView : full;

  // Câmera: o viewBox não transiciona via CSS, então interpolamos com requestAnimationFrame.
  const svgRef = useRef<SVGSVGElement>(null);
  const initialView = useRef(full);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const current = svg.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
    const from = current && current.length === 4 && current.every(Number.isFinite) ? current : [...target];
    const to = [...target];
    if (reduced || paused) {
      svg.setAttribute("viewBox", to.join(" "));
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / CAMERA_MS);
      const e = 1 - Math.pow(1 - t, 3);
      svg.setAttribute("viewBox", from.map((v, i) => (v + (to[i] - v) * e).toFixed(2)).join(" "));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, paused]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (paused) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [paused, epoch, stage]);

  const zones = [...resolved.values()].filter((r) => r.ent.type === "zone").sort((a, b) => a.ax + a.ay - (b.ax + b.ay));
  const things = [...resolved.values()]
    .filter((r) => r.ent.type !== "zone")
    .sort((a, b) => a.ax + a.ay - (b.ax + b.ay) || a.az - b.az);
  const ghostZones = snap.ghosts.filter((r) => r.ent.type === "zone");
  const ghostThings = snap.ghosts.filter((r) => r.ent.type !== "zone");

  const anchors = useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const [id, r] of resolved) map.set(id, anchorOf(r));
    return map;
  }, [resolved]);

  const linkLines = (stage.links ?? []).flatMap((l) => {
    const a = anchors.get(l.from);
    const b = anchors.get(l.to);
    return a && b ? [{ l, a, b }] : [];
  });

  const flowPaths: FlowPath[] = (stage.flows ?? []).flatMap((f, i) => {
    const geo = flowGeometries({ ...stage, flows: [f] }, resolved)[0];
    return geo ? [{ key: `${geo.id}-${i}`, kind: f.kind ?? "req", points: geo.points, rate: f.rate, label: f.label }] : [];
  });

  return (
    <div ref={wrapRef} className="relative h-full w-full">
    <svg
      ref={svgRef}
      viewBox={initialView.current.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      className="block h-full w-full select-none"
    >
      <g key={`z-${epoch}`}>
        {zones.map((r) => (
          <Entity key={r.ent.id} r={r} entering={snap.entering.has(r.ent.id)} reduced={reduced} />
        ))}
        {ghostZones.map((r) => (
          <Entity key={`ghost-${r.ent.id}`} r={r} ghost reduced={reduced} />
        ))}
      </g>

      <g key={`l-${epoch}`} pointerEvents="none">
        {linkLines.map(({ l, a, b }) => {
          const tone = l.tone ? TONE[l.tone].stroke : "#9a8fd0";
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          return (
            <g key={linkKey(l)} className={snap.newLinks.has(linkKey(l)) && !reduced ? "scene-fade" : undefined}>
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={tone} strokeOpacity={0.5} strokeWidth={1.6} strokeDasharray={l.style === "dashed" ? "5 5" : undefined} strokeLinecap="round" />
              {l.label && (
                <g transform={`translate(${mx},${my})`}>
                  <rect x={-linkLabelWidth(l.label) / 2} y={-8} width={linkLabelWidth(l.label)} height={15} rx={7.5} fill="#0b0814" fillOpacity={0.92} stroke={tone} strokeOpacity={0.5} />
                  <text textAnchor="middle" y={3} fontSize={9} fill={tone} fontFamily="ui-monospace, monospace">
                    {l.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>

      <g key={`t-${epoch}`}>
        {things.map((r) => (
          <Entity key={r.ent.id} r={r} entering={snap.entering.has(r.ent.id)} reduced={reduced} />
        ))}
        {ghostThings.map((r) => (
          <Entity key={`ghost-${r.ent.id}`} r={r} ghost reduced={reduced} />
        ))}
      </g>

      <Flows flows={flowPaths} reduced={reduced} epoch={epoch} />
    </svg>
    {canZoom && (
      <button
        type="button"
        onClick={() => setZoomed((z) => !z)}
        className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-900/85 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-200 backdrop-blur hover:border-arcane-400/50"
        aria-label={zoomed ? "Ver o diagrama inteiro" : "Aproximar no que importa"}
      >
        {zoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
        {zoomed ? "ver tudo" : "aproximar"}
      </button>
    )}
    </div>
  );
}

// ---------- elementos ----------

const STATUS_OPACITY: Partial<Record<Status, number>> = { dead: 0.45, muted: 0.4 };

function Entity({ r, entering, ghost, reduced }: { r: Resolved; entering?: boolean; ghost?: boolean; reduced: boolean }) {
  const [ox, oy] = originOf(r);
  const status = r.ent.status;
  const filter = status === "dead" ? "grayscale(1)" : status === "bad" ? "drop-shadow(0 0 7px rgba(251,113,133,0.6))" : status === "hi" ? "drop-shadow(0 0 6px rgba(167,139,250,0.45))" : "none";
  const cls = ghost ? "scene-exit" : entering && !reduced ? "scene-enter" : undefined;
  return (
    <g
      className="scene-ent"
      data-scene-ent={r.ent.id}
      data-status={status ?? "ok"}
      style={{ transform: `translate(${ox}px, ${oy}px)`, opacity: (status && STATUS_OPACITY[status]) ?? 1, filter }}
    >
      <g className={cls}>
        {r.ent.type === "zone" ? <ZoneShape z={r.ent} /> : r.ent.type === "box" ? <BoxShape b={r.ent} reduced={reduced} /> : <UsersShape u={r.ent} />}
      </g>
    </g>
  );
}

const Pill = ({ x, y, text, fg = "#e4e0f0", line = "rgba(255,255,255,0.1)" }: { x: number; y: number; text: string; fg?: string; line?: string }) => {
  const w = labelWidth(text);
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2} y={-8} width={w} height={15} rx={7.5} fill="#0b0814" fillOpacity={0.9} stroke={line} />
      <text textAnchor="middle" y={3} fontSize={10} fill={fg} fontFamily="Inter, system-ui, sans-serif">
        {text}
      </text>
    </g>
  );
};

function ringPoints(edge: number) {
  return `0,${-14 * edge} ${28 * edge},0 0,${14 * edge} ${-28 * edge},0`;
}

function ZoneShape({ z }: { z: IsoZone }) {
  const th = z.th ?? ZONE_TH;
  const c = zoneColors(z.tone);
  const stroke = z.status === "bad" ? STATUS_STROKE.bad : z.status === "warn" ? STATUS_STROKE.warn : z.status === "hi" ? STATUS_STROKE.hi : c.stroke;
  const hw = TW / 2;
  const hh = TH / 2;
  const back: [number, number] = [0, 0];
  const right: [number, number] = [z.w * hw, z.w * hh];
  const front: [number, number] = [(z.w - z.d) * hw, (z.w + z.d) * hh];
  const left: [number, number] = [-z.d * hw, z.d * hh];
  const pts = (list: [number, number][]) => list.map(([x, y]) => `${x},${y}`).join(" ");
  const up = (p: [number, number]): [number, number] => [p[0], p[1] - th];
  const dash = z.dashed ? "6 5" : undefined;
  return (
    <g>
      <polygon points={pts([left, front, up(front), up(left)])} fill={c.left} stroke={stroke} strokeOpacity={0.6} strokeWidth={1} />
      <polygon points={pts([front, right, up(right), up(front)])} fill={c.right} stroke={stroke} strokeOpacity={0.6} strokeWidth={1} />
      <polygon points={pts([up(back), up(right), up(front), up(left)])} fill={c.top} stroke={stroke} strokeWidth={z.status ? 1.6 : 1.1} strokeDasharray={dash} />
      {z.label && <Pill x={zoneLabelPos(z)[0]} y={zoneLabelPos(z)[1]} text={z.label} fg={TONE[z.tone ?? "zinc"].stroke} line={c.pill} />}
    </g>
  );
}

function BadgePill({ b, y }: { b: Badge; y: number }) {
  const col = BADGE_COLORS[b.tone ?? "info"];
  const w = badgeWidth(b.text);
  return (
    <g transform={`translate(0,${y})`}>
      <rect x={-w / 2} width={w} height={BADGE_H} rx={5} fill={col.bg} stroke={col.line} strokeOpacity={0.7} />
      <text textAnchor="middle" y={11.2} fontSize={9} fill={col.fg} fontFamily="ui-monospace, monospace">
        {b.text}
      </text>
    </g>
  );
}

function BoxShape({ b, reduced }: { b: IsoBox; reduced: boolean }) {
  const { edge: s, h } = BOX_SIZE[b.size ?? "md"];
  const c = TONE[b.tone ?? "arcane"];
  const stroke = b.status === "bad" ? STATUS_STROKE.bad : b.status === "warn" ? STATUS_STROKE.warn : b.status === "hi" ? STATUS_STROKE.hi : c.stroke;
  const sw = b.status === "bad" || b.status === "warn" || b.status === "hi" ? 2 : 1;
  const so = sw > 1 ? 1 : 0.55;
  const Icon = ICONS[b.icon];
  const iconSize = b.size === "sm" ? 13 : 15;
  const back = `0,${-14 * s - h}`;
  const rightTop = `${28 * s},${-h}`;
  const frontTop = `0,${14 * s - h}`;
  const leftTop = `${-28 * s},${-h}`;
  const frontBase = `0,${14 * s}`;
  const rightBase = `${28 * s},0`;
  const leftBase = `${-28 * s},0`;

  const { labelY, meterY = 0, badgeYs } = boxStack(b);

  return (
    <g>
      {b.status === "hi" && <polygon points={ringPoints(s + 0.5)} fill="none" stroke={STATUS_STROKE.hi} strokeWidth={2} strokeOpacity={0.9} />}
      {b.status === "new" && <polygon points={ringPoints(s + 0.55)} fill="none" stroke={STATUS_STROKE.new} strokeWidth={2.2} className={reduced ? undefined : "scene-ring"} strokeOpacity={reduced ? 0.8 : undefined} />}
      <polygon points={`${leftTop} ${frontTop} ${frontBase} ${leftBase}`} fill={c.left} stroke={stroke} strokeOpacity={so} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={`${frontTop} ${rightTop} ${rightBase} ${frontBase}`} fill={c.right} stroke={stroke} strokeOpacity={so} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={`${back} ${rightTop} ${frontTop} ${leftTop}`} fill={c.top} stroke={stroke} strokeOpacity={sw > 1 ? 1 : 0.7} strokeWidth={sw} strokeLinejoin="round" />
      <Icon x={-iconSize / 2} y={-h - iconSize / 2} width={iconSize} height={iconSize} color="rgba(255,255,255,0.95)" strokeWidth={2.2} />
      {b.status === "bad" && (
        <g transform={`translate(${28 * s - 3},${-h - 9})`}>
          <circle r={7} fill="#e11d48" stroke="#fecdd3" strokeWidth={1} />
          <path d="M-2.6,-2.6 L2.6,2.6 M2.6,-2.6 L-2.6,2.6" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
        </g>
      )}
      <Pill x={0} y={labelY} text={b.label} />
      {typeof b.meter === "number" && (
        <g transform={`translate(${-18},${meterY})`}>
          <rect width={36} height={4} rx={2} fill="#2a2145" />
          <rect width={(36 * Math.max(0, Math.min(100, b.meter))) / 100} height={4} rx={2} fill={b.meter < 60 ? "#34d399" : b.meter < 85 ? "#f59e0b" : "#fb7185"} />
        </g>
      )}
      {(b.badges ?? []).map((badge, i) => (
        <BadgePill key={badge.text} b={badge} y={badgeYs[i]} />
      ))}
    </g>
  );
}

function UsersShape({ u }: { u: IsoUsers }) {
  const { cols, w, d } = usersLayout(u);
  const th = USERS_PLATFORM_TH;
  const corners = [project(-w / 2, -d / 2), project(w / 2, -d / 2), project(w / 2, d / 2), project(-w / 2, d / 2)];
  const up = (p: number[]) => `${p[0]},${p[1] - th}`;
  const figures = Array.from({ length: Math.max(1, Math.min(9, u.count)) }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const [fx, fy] = project(-w / 2 + 0.15 + (col + 0.5) * USERS_CELL, -d / 2 + 0.15 + (row + 0.5) * USERS_CELL, th);
    return { i, fx, fy, depth: row + col };
  }).sort((a, b) => a.depth - b.depth);
  const front = corners[2];
  return (
    <g>
      <polygon points={`${corners[3]} ${corners[2]} ${up(corners[2])} ${up(corners[3])}`} fill="#171229" stroke="#3b3158" strokeWidth={1} />
      <polygon points={`${corners[2]} ${corners[1]} ${up(corners[1])} ${up(corners[2])}`} fill="#120e20" stroke="#3b3158" strokeWidth={1} />
      <polygon points={corners.map(up).join(" ")} fill="#201a38" stroke="#4a3f78" strokeWidth={1} />
      {figures.map((f) => (
        <g key={f.i} transform={`translate(${f.fx},${f.fy})`}>
          <rect x={-3.6} y={-9} width={7.2} height={9} rx={3.4} fill="#a78bfa" />
          <circle cy={-12.6} r={3.5} fill="#ddd2ff" />
        </g>
      ))}
      {u.label && <Pill x={0} y={front[1] + 14} text={u.label} />}
      {u.status === "new" && <polygon points={corners.map(up).join(" ")} fill="none" stroke={STATUS_STROKE.new} strokeWidth={2} className="scene-ring" />}
    </g>
  );
}
