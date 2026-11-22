import type {
  ArrayPanel,
  BarsPanel,
  BucketsPanel,
  ChartPanel,
  GraphPanel,
  GridPanel,
  ListPanel,
  Panel,
  TextPanel,
  Tone,
  TreeNode,
  TreePanel,
  VarsPanel,
} from "@/lib/visualizers/types";
import { cn } from "@/lib/utils";

/** Classes de célula por tom (HTML). */
const CELL: Record<Tone, string> = {
  default: "border-white/10 bg-white/[0.03] text-zinc-200",
  active: "border-arcane-400/70 bg-arcane-500/25 text-white shadow-[0_0_14px_-4px_rgba(167,139,250,0.8)]",
  compare: "border-cyan-400/70 bg-cyan-400/15 text-cyan-100",
  done: "border-emerald-400/60 bg-emerald-400/15 text-emerald-100",
  swap: "border-amber-400/70 bg-amber-400/20 text-amber-100",
  bad: "border-rose-400/70 bg-rose-500/20 text-rose-100",
  muted: "border-white/5 bg-transparent text-zinc-600",
  path: "border-sky-400/70 bg-sky-400/20 text-sky-100",
};

/** Cores por tom (SVG). */
export const COLOR: Record<Tone, { fill: string; stroke: string; text: string }> = {
  default: { fill: "#1c1630", stroke: "#3b3158", text: "#e4e0f0" },
  active: { fill: "#4c2f99", stroke: "#a78bfa", text: "#ffffff" },
  compare: { fill: "#0e3a46", stroke: "#22d3ee", text: "#cffafe" },
  done: { fill: "#0f3d2f", stroke: "#34d399", text: "#d1fae5" },
  swap: { fill: "#4a3410", stroke: "#f59e0b", text: "#fef3c7" },
  bad: { fill: "#4c1527", stroke: "#fb7185", text: "#ffe4e6" },
  muted: { fill: "#110d1d", stroke: "#2a2145", text: "#5b5470" },
  path: { fill: "#0c3550", stroke: "#38bdf8", text: "#e0f2fe" },
};

const POINTER_TEXT: Record<Tone, string> = {
  default: "text-zinc-400",
  active: "text-arcane-300",
  compare: "text-cyan-300",
  done: "text-emerald-300",
  swap: "text-amber-300",
  bad: "text-rose-300",
  muted: "text-zinc-600",
  path: "text-sky-300",
};

const CELL_W = 42; // px, largura fixa das células de arrays

function PanelLabel({ children }: { children?: string }) {
  if (!children) return null;
  return <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{children}</div>;
}

function ArrayView({ p }: { p: ArrayPanel }) {
  const base = p.indexBase ?? 0;
  const pointersAt = (i: number) => (p.pointers ?? []).filter((ptr) => ptr.index === i);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block min-w-full">
        <div className="flex gap-1">
          {p.values.map((v, i) => (
            <div key={i} className="flex flex-col items-center" style={{ width: CELL_W }}>
              <div className="flex h-5 flex-col items-center justify-end">
                {pointersAt(i).map((ptr) => (
                  <span key={ptr.label} className={cn("font-mono text-[9.5px] font-semibold leading-none", POINTER_TEXT[ptr.tone ?? "active"])}>
                    {ptr.label}
                  </span>
                ))}
              </div>
              <div className={cn("mt-0.5 flex h-10 w-full items-center justify-center rounded-md border font-mono text-[13px] transition-all duration-300", CELL[p.tones?.[i] ?? "default"])}>
                {v === null || v === undefined ? "" : String(v)}
              </div>
              {p.showIndex !== false && <span className="mt-1 font-mono text-[9px] text-zinc-600">{i + base}</span>}
            </div>
          ))}
        </div>
        {(p.ranges ?? []).length > 0 && (
          <div className="relative mt-1 h-5">
            {p.ranges!.map((r, k) => (
              <div
                key={k}
                className={cn("absolute top-0 flex h-4 items-center justify-center rounded border font-mono text-[9px]", CELL[r.tone ?? "compare"])}
                style={{ left: r.from * (CELL_W + 4), width: (r.to - r.from + 1) * (CELL_W + 4) - 4 }}
              >
                {r.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BarsView({ p }: { p: BarsPanel }) {
  const max = Math.max(1, ...p.values.map(Math.abs));
  const w = Math.max(18, Math.min(44, Math.floor(560 / Math.max(1, p.values.length))));
  return (
    <div className="overflow-x-auto">
      <div className="flex h-44 items-end gap-1">
        {p.values.map((v, i) => {
          const ptrs = (p.pointers ?? []).filter((ptr) => ptr.index === i);
          return (
            <div key={i} className="flex h-full flex-col items-center justify-end" style={{ width: w }}>
              <span className="mb-0.5 font-mono text-[9.5px] text-zinc-400">{v}</span>
              <div
                className={cn("w-full rounded-t-md border transition-all duration-300", CELL[p.tones?.[i] ?? "default"])}
                style={{ height: `${Math.max(4, (Math.abs(v) / max) * 100)}%` }}
              />
              <div className="flex h-4 items-start">
                {ptrs.map((ptr) => (
                  <span key={ptr.label} className={cn("font-mono text-[9px] font-semibold", POINTER_TEXT[ptr.tone ?? "active"])}>
                    {ptr.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GraphView({ p }: { p: GraphPanel }) {
  const W = p.width ?? 100;
  const H = p.height ?? 60;
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const r = 4.6;
  const hasReverse = (from: string, to: string) => p.edges.some((e) => e.from === to && e.to === from && e.directed);
  return (
    <svg viewBox={`-6 -6 ${W + 12} ${H + 14}`} className="w-full" style={{ maxHeight: 360 }}>
      <defs>
        {(Object.keys(COLOR) as Tone[]).map((t) => (
          <marker key={t} id={`arrow-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLOR[t].stroke} />
          </marker>
        ))}
      </defs>
      {p.edges.map((e, i) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        const tone = e.tone ?? "default";
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        // Curva quando existe aresta no sentido oposto (grafo dirigido com ida e volta).
        const bend = e.directed && hasReverse(e.from, e.to) ? 5 : 0;
        const nx = -dy / len;
        const ny = dx / len;
        const sx = a.x + (dx / len) * r;
        const sy = a.y + (dy / len) * r;
        const ex = b.x - (dx / len) * (r + (e.directed ? 0.8 : 0));
        const ey = b.y - (dy / len) * (r + (e.directed ? 0.8 : 0));
        const cx = (sx + ex) / 2 + nx * bend;
        const cy = (sy + ey) / 2 + ny * bend;
        const stroke = tone === "default" ? "#3b3158" : COLOR[tone].stroke;
        return (
          <g key={i}>
            <path
              d={`M${sx},${sy} Q${cx},${cy} ${ex},${ey}`}
              fill="none"
              stroke={stroke}
              strokeWidth={tone === "default" || tone === "muted" ? 0.6 : 1.1}
              strokeOpacity={tone === "muted" ? 0.35 : 1}
              markerEnd={e.directed ? `url(#arrow-${tone})` : undefined}
            />
            {e.label && (
              <text x={cx + nx * 2.6} y={cy + ny * 2.6} fontSize={3.6} textAnchor="middle" dominantBaseline="middle" fill={tone === "default" ? "#9d95b8" : COLOR[tone].stroke} fontFamily="monospace" stroke="#0f0b1a" strokeWidth={1.1} paintOrder="stroke">
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {p.nodes.map((n) => {
        const c = COLOR[n.tone ?? "default"];
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r} fill={c.fill} stroke={c.stroke} strokeWidth={0.7} />
            <text x={n.x} y={n.y} fontSize={(n.label ?? n.id).length > 3 ? 2.8 : 3.8} textAnchor="middle" dominantBaseline="central" fill={c.text} fontFamily="monospace" fontWeight={600}>
              {n.label ?? n.id}
            </text>
            {n.badge !== undefined && (
              <text x={n.x} y={n.y + r + 3.6} fontSize={3.4} textAnchor="middle" fill="#c4b2ff" fontFamily="monospace" stroke="#0f0b1a" strokeWidth={1.1} paintOrder="stroke">
                {n.badge}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type Placed = { node: TreeNode; x: number; depth: number; parent?: Placed };

function layoutTree(root: TreeNode, binary: boolean): Placed[] {
  const placed: Placed[] = [];
  let slot = 0;
  const visit = (node: TreeNode | null, depth: number, parent?: Placed): number => {
    if (!node) {
      return slot++; // espaço vazio mantém esquerda/direita em árvores binárias
    }
    const kids = node.children ?? [];
    const self: Placed = { node, x: 0, depth, parent };
    placed.push(self);
    const real = kids.filter((k) => k !== null);
    if (real.length === 0) {
      self.x = slot++;
      return self.x;
    }
    const xs: number[] = [];
    for (const kid of binary ? kids : real) {
      const x = visit(kid ?? null, depth + 1, self);
      if (kid) xs.push(x);
      else if (binary) xs.push(x);
    }
    self.x = binary && kids.length === 2 ? (xs[0] + xs[1]) / 2 : xs.reduce((a, b) => a + b, 0) / xs.length;
    return self.x;
  };
  visit(root, 0);
  return placed;
}

function TreeView({ p }: { p: TreePanel }) {
  if (!p.root) return <div className="py-6 text-center font-mono text-[12px] text-zinc-600">(árvore vazia)</div>;
  const placed = layoutTree(p.root, p.binary ?? true);
  const maxX = Math.max(0, ...placed.map((n) => n.x));
  const maxD = Math.max(0, ...placed.map((n) => n.depth));
  const gapX = 12;
  const gapY = 13;
  const W = Math.max(40, (maxX + 1) * gapX);
  const H = (maxD + 1) * gapY;
  const pos = (n: Placed) => ({ x: n.x * gapX + gapX / 2, y: n.depth * gapY + 6 });
  const r = 4.3;
  const SCALE = 4.6; // px por unidade: nós do mesmo tamanho em todos os passos
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W + 8} ${H + 4}`} width={(W + 8) * SCALE} height={(H + 4) * SCALE} className="mx-auto block max-w-none">
        {placed.map((n) => {
          if (!n.parent) return null;
          const a = pos(n.parent);
          const b = pos(n);
          const tone = n.node.tone === "path" || n.node.tone === "active" ? n.node.tone : "default";
          return <line key={`e-${n.node.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tone === "default" ? "#3b3158" : COLOR[tone].stroke} strokeWidth={0.6} />;
        })}
        {placed.map((n) => {
          const { x, y } = pos(n);
          const c = COLOR[n.node.tone ?? "default"];
          return (
            <g key={n.node.id}>
              <circle cx={x} cy={y} r={r} fill={c.fill} stroke={c.stroke} strokeWidth={0.6} />
              <text x={x} y={y} fontSize={n.node.label.length > 3 ? 2.6 : 3.3} textAnchor="middle" dominantBaseline="central" fill={c.text} fontFamily="monospace" fontWeight={600}>
                {n.node.label}
              </text>
              {n.node.badge !== undefined && (
                <text x={x + r + 0.6} y={y - r + 1} fontSize={2.5} fill="#c4b2ff" fontFamily="monospace">
                  {n.node.badge}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GridView({ p }: { p: GridPanel }) {
  const toneAt = (r: number, c: number) => p.tones?.find((t) => t.r === r && t.c === c)?.tone ?? "default";
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        {p.colHeaders && (
          <thead>
            <tr>
              {p.rowHeaders && <th />}
              {p.colHeaders.map((h, i) => (
                <th key={i} className="px-1 text-center font-mono text-[10px] font-normal text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {p.rows.map((row, r) => (
            <tr key={r}>
              {p.rowHeaders && <th className="pr-1.5 text-right font-mono text-[10px] font-normal text-zinc-500">{p.rowHeaders[r]}</th>}
              {row.map((v, c) => (
                <td key={c} className={cn("h-8 min-w-[34px] rounded-md border px-1.5 text-center font-mono text-[12px] transition-all duration-300", CELL[toneAt(r, c)])}>
                  {v === null || v === undefined ? "" : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListView({ p }: { p: ListPanel }) {
  const ptrs = (i: number) => (p.pointers ?? []).filter((ptr) => ptr.index === i);
  const Box = ({ item, i }: { item: ListPanel["items"][number]; i: number }) => (
    <div className="flex flex-col items-center">
      <div className="flex h-4 items-end gap-1">
        {ptrs(i).map((ptr) => (
          <span key={ptr.label} className={cn("font-mono text-[9.5px] font-semibold", POINTER_TEXT[ptr.tone ?? "active"])}>
            {ptr.label}
          </span>
        ))}
      </div>
      <div className={cn("mt-0.5 flex min-w-[44px] flex-col items-center justify-center rounded-md border px-2 py-1.5 font-mono text-[12.5px] transition-all duration-300", CELL[item.tone ?? "default"])}>
        <span>{item.label}</span>
        {item.sub && <span className="text-[9px] opacity-70">{item.sub}</span>}
      </div>
    </div>
  );
  if (p.style === "stack") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="font-mono text-[9.5px] text-zinc-600">topo ↓</span>
        {p.items.length === 0 && <span className="font-mono text-[12px] text-zinc-600">(vazia)</span>}
        {[...p.items].map((item, i) => ({ item, i })).reverse().map(({ item, i }) => (
          <Box key={i} item={item} i={i} />
        ))}
      </div>
    );
  }
  const arrow = p.style === "doubly" ? "⇄" : p.style === "queue" ? "" : "→";
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-end gap-1.5">
        {p.style === "queue" && <span className="mb-3 font-mono text-[9.5px] text-zinc-600">frente</span>}
        {p.items.length === 0 && <span className="mb-2 font-mono text-[12px] text-zinc-600">(vazia)</span>}
        {p.items.map((item, i) => (
          <div key={i} className="flex items-end gap-1.5">
            <Box item={item} i={i} />
            {arrow && (i < p.items.length - 1 || p.style !== "circular") && <span className="mb-3 text-zinc-500">{arrow}</span>}
          </div>
        ))}
        {(p.style === "linked" || p.style === "doubly") && p.items.length > 0 && <span className="mb-3 font-mono text-[11px] text-zinc-600">null</span>}
        {p.style === "circular" && p.items.length > 0 && <span className="mb-3 font-mono text-[11px] text-arcane-300">↺ volta ao início</span>}
        {p.style === "queue" && p.items.length > 0 && <span className="mb-3 font-mono text-[9.5px] text-zinc-600">fim</span>}
      </div>
    </div>
  );
}

function BucketsView({ p }: { p: BucketsPanel }) {
  return (
    <div className="flex flex-col gap-1">
      {p.buckets.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={cn("w-12 shrink-0 rounded border px-1.5 py-1 text-center font-mono text-[11px]", CELL[b.tone ?? "default"])}>{b.label}</span>
          <span className="text-zinc-600">→</span>
          <div className="flex flex-wrap items-center gap-1">
            {b.items.length === 0 && <span className="font-mono text-[11px] text-zinc-700">∅</span>}
            {b.items.map((item, k) => (
              <span key={k} className={cn("rounded border px-2 py-0.5 font-mono text-[11.5px] transition-all duration-300", CELL[item.tone ?? "default"])}>
                {item.label}
                {item.sub && <span className="ml-1 text-[9px] opacity-70">{item.sub}</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VarsView({ p }: { p: VarsPanel }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {p.entries.map((e) => (
        <span key={e.name} className={cn("rounded-md border px-2 py-1 font-mono text-[11.5px] transition-all duration-300", CELL[e.tone ?? "default"])}>
          <span className="text-zinc-500">{e.name} = </span>
          {String(e.value)}
        </span>
      ))}
    </div>
  );
}

function ChartView({ p }: { p: ChartPanel }) {
  const W = 100;
  const H = 52;
  const all = p.series.flatMap((s) => s.points);
  const maxX = Math.max(1, ...all.map((pt) => pt[0]));
  const ys = all.map((pt) => pt[1]);
  const tf = (y: number) => (p.logY ? Math.log10(Math.max(1, y)) : y);
  const maxY = Math.max(1, ...ys.map(tf));
  const sx = (x: number) => 8 + (x / maxX) * (W - 12);
  const sy = (y: number) => H - 4 - (tf(y) / maxY) * (H - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H + 6}`} className="w-full" style={{ maxHeight: 300 }}>
      <line x1={8} y1={H - 4} x2={W - 2} y2={H - 4} stroke="#3b3158" strokeWidth={0.3} />
      <line x1={8} y1={4} x2={8} y2={H - 4} stroke="#3b3158" strokeWidth={0.3} />
      {p.xLabel && <text x={W - 2} y={H + 1.5} fontSize={2.4} textAnchor="end" fill="#6f6787" fontFamily="monospace">{p.xLabel}</text>}
      {p.yLabel && <text x={9} y={3} fontSize={2.4} fill="#6f6787" fontFamily="monospace">{p.yLabel}{p.logY ? " (escala log)" : ""}</text>}
      {p.markerX !== undefined && <line x1={sx(p.markerX)} y1={4} x2={sx(p.markerX)} y2={H - 4} stroke="#a78bfa" strokeWidth={0.3} strokeDasharray="1 1" />}
      {p.series.map((s) => {
        const c = COLOR[s.tone ?? "active"].stroke;
        const last = s.points[s.points.length - 1];
        return (
          <g key={s.label}>
            <polyline fill="none" stroke={c} strokeWidth={0.6} points={s.points.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} />
            {last && (
              <text x={Math.min(sx(last[0]) + 0.8, W - 14)} y={sy(last[1]) - 0.8} fontSize={2.3} fill={c} fontFamily="monospace">
                {s.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function TextView({ p }: { p: TextPanel }) {
  return (
    <div className="flex flex-col gap-0.5 font-mono text-[12px]">
      {p.lines.map((l, i) => (
        <div key={i} className={cn("rounded px-2 py-0.5", l.tone && l.tone !== "default" ? CELL[l.tone] + " border" : "text-zinc-300")}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

export function PanelView({ panel }: { panel: Panel }) {
  return (
    <div className="min-w-0">
      <PanelLabel>{panel.label}</PanelLabel>
      {panel.kind === "array" && <ArrayView p={panel} />}
      {panel.kind === "bars" && <BarsView p={panel} />}
      {panel.kind === "graph" && <GraphView p={panel} />}
      {panel.kind === "tree" && <TreeView p={panel} />}
      {panel.kind === "grid" && <GridView p={panel} />}
      {panel.kind === "list" && <ListView p={panel} />}
      {panel.kind === "buckets" && <BucketsView p={panel} />}
      {panel.kind === "vars" && <VarsView p={panel} />}
      {panel.kind === "chart" && <ChartView p={panel} />}
      {panel.kind === "text" && <TextView p={panel} />}
    </div>
  );
}
