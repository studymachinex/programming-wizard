/**
 * Projeção isométrica, âncoras e limites do modo "iso". Funções puras (sem React), testáveis com `tsx`.
 */
import {
  AlertTriangle,
  Box,
  Check,
  Clock,
  Cloud,
  Cog,
  Container,
  Cpu,
  Database,
  Eye,
  File,
  FileText,
  Folder,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  Key,
  Layers,
  List,
  Lock,
  Mail,
  Network,
  RefreshCw,
  Router,
  Scale,
  Search,
  Server,
  Ship,
  Shield,
  Terminal,
  User,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { IsoBox, IsoEntity, IsoStage, IsoUsers, IsoZone, Tone } from "./types";

/** Ícones disponíveis para caixas e lanes. Um único lugar mapeia nome -> componente do lucide. */
export const ICONS = {
  server: Server,
  database: Database,
  globe: Globe,
  user: User,
  users: Users,
  layers: Layers,
  box: Box,
  container: Container,
  cpu: Cpu,
  "hard-drive": HardDrive,
  network: Network,
  router: Router,
  shield: Shield,
  lock: Lock,
  key: Key,
  file: File,
  "file-text": FileText,
  folder: Folder,
  clock: Clock,
  gauge: Gauge,
  terminal: Terminal,
  cloud: Cloud,
  refresh: RefreshCw,
  "git-branch": GitBranch,
  list: List,
  zap: Zap,
  mail: Mail,
  search: Search,
  scale: Scale,
  ship: Ship,
  cog: Cog,
  eye: Eye,
  alert: AlertTriangle,
  check: Check,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const TW = 56; // largura do losango de uma unidade de grade
export const TH = 28; // altura do losango de uma unidade de grade

/** (x, y) em unidades de grade e z em px -> ponto da tela. */
export function project(x: number, y: number, z = 0): [number, number] {
  return [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z];
}

export const BOX_SIZE = {
  sm: { edge: 1.2, h: 18 },
  md: { edge: 1.6, h: 26 },
  lg: { edge: 2.2, h: 34 },
} as const;

export const ZONE_TH = 10;
export const USERS_CELL = 0.62;
export const USERS_PLATFORM_TH = 4;

// ---------- cores ----------

export type ToneColors = { top: string; left: string; right: string; stroke: string };

/** Três luminosidades por tom: topo mais claro, face esquerda média, face direita escura. */
export const TONE: Record<Tone, ToneColors> = {
  arcane: { top: "#a78bfa", left: "#7c3aed", right: "#5b21b6", stroke: "#c4b2ff" },
  mana: { top: "#22d3ee", left: "#0891b2", right: "#0e7490", stroke: "#67e8f9" },
  rune: { top: "#34d399", left: "#059669", right: "#047857", stroke: "#6ee7b7" },
  ember: { top: "#fbbf24", left: "#d97706", right: "#b45309", stroke: "#fcd34d" },
  rose: { top: "#fb7185", left: "#e11d48", right: "#9f1239", stroke: "#fda4af" },
  sky: { top: "#38bdf8", left: "#0284c7", right: "#0369a1", stroke: "#7dd3fc" },
  zinc: { top: "#8b86a3", left: "#5e5878", right: "#433d5a", stroke: "#b6b0cc" },
  violet: { top: "#e879f9", left: "#c026d3", right: "#86198f", stroke: "#f0abfc" },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Mistura `a` com `b`; t = 0 devolve `a`, t = 1 devolve `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

const ZONE_BG = "#0d0a17";

/** Zonas usam o mesmo tom, mais escuro e com pouca saturação, para o conteúdo se destacar. */
export function zoneColors(tone: Tone = "zinc") {
  const t = TONE[tone];
  return {
    top: mix(t.top, ZONE_BG, 0.88),
    left: mix(t.left, ZONE_BG, 0.86),
    right: mix(t.right, ZONE_BG, 0.9),
    stroke: mix(t.stroke, ZONE_BG, 0.62),
    pill: mix(t.stroke, ZONE_BG, 0.45),
  };
}

export const STATUS_STROKE = {
  bad: "#fb7185",
  warn: "#fbbf24",
  hi: "#a78bfa",
  new: "#34d399",
} as const;

// ---------- entidades resolvidas ----------

/** Entidade com a posição absoluta já calculada (parent resolvido). */
export type Resolved = { ent: IsoEntity; ax: number; ay: number; az: number };

export function resolveEntities(entities: IsoEntity[]): Map<string, Resolved> {
  const out = new Map<string, Resolved>();
  for (const e of entities) {
    if (e.type === "zone") out.set(e.id, { ent: e, ax: e.x, ay: e.y, az: e.z ?? 0 });
  }
  for (const e of entities) {
    if (e.type === "zone") continue;
    if (e.type === "box" && e.parent) {
      const p = out.get(e.parent);
      if (p && p.ent.type === "zone") {
        out.set(e.id, {
          ent: e,
          ax: p.ax + e.x,
          ay: p.ay + e.y,
          az: p.az + (p.ent.th ?? ZONE_TH) + (e.z ?? 0),
        });
        continue;
      }
    }
    out.set(e.id, { ent: e, ax: e.x, ay: e.y, az: e.type === "box" ? e.z ?? 0 : 0 });
  }
  return out;
}

/** Origem de desenho (px) de uma entidade: base do cubo, canto de trás da zona, centro do grupo de users. */
export function originOf(r: Resolved): [number, number] {
  return project(r.ax, r.ay, r.az);
}

/** Posição (local à origem da zona) da pílula do label: no meio da aresta da frente-esquerda, para não colidir com as caixas. */
export function zoneLabelPos(z: IsoZone): [number, number] {
  const left: [number, number] = [-z.d * (TW / 2), z.d * (TH / 2)];
  const front: [number, number] = [(z.w - z.d) * (TW / 2), (z.w + z.d) * (TH / 2)];
  return [(left[0] + front[0]) / 2 - 14, (left[1] + front[1]) / 2 + 13];
}

export function usersLayout(u: IsoUsers) {
  const cols = Math.min(3, Math.max(1, u.count));
  const rows = Math.ceil(Math.max(1, Math.min(9, u.count)) / 3);
  return { cols, rows, w: cols * USERS_CELL + 0.3, d: rows * USERS_CELL + 0.3 };
}

/** Âncora (ponto da tela) usada por links e fluxos. */
export function anchorOf(r: Resolved): [number, number] {
  const e = r.ent;
  if (e.type === "zone") {
    const th = e.th ?? ZONE_TH;
    return project(r.ax + e.w / 2, r.ay + e.d / 2, r.az + th);
  }
  if (e.type === "box") {
    const { h } = BOX_SIZE[e.size ?? "md"];
    return project(r.ax, r.ay, r.az + h);
  }
  return project(r.ax, r.ay, r.az + USERS_PLATFORM_TH + 9);
}

// ---------- limites e retângulos ----------

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

export function labelWidth(text: string, charW = 5.8, pad = 12) {
  return text.length * charW + pad;
}

export const BADGE_H = 16;
export const BADGE_GAP = 2;

export function badgeWidth(text: string) {
  return labelWidth(text, 5.3, 12);
}

/** Largura da pílula do label de um link e de um fluxo (mesmas contas do renderizador). */
export const linkLabelWidth = (text: string) => labelWidth(text, 5.4, 10);
export const flowLabelWidth = (text: string) => labelWidth(text, 5.8, 14);

// ---------- caminhos ----------

export function pathLength(points: [number, number][]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** Ponto a `frac` (0–1) do comprimento da polilinha, com o ângulo do segmento. */
export function pointAt(points: [number, number][], frac: number): { x: number; y: number; angle: number } {
  const total = pathLength(points) || 1;
  let target = total * frac;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (target <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, target / seg);
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, angle: Math.atan2(y1 - y0, x1 - x0) };
    }
    target -= seg;
  }
  return { x: points[0][0], y: points[0][1], angle: 0 };
}

// ---------- retângulos de tela ----------

export type Box2 = { x0: number; y0: number; x1: number; y1: number };
export type LayoutKind = "cube" | "label" | "badge" | "meter" | "zone-label" | "link-label" | "flow-label";
export type LayoutItem = { kind: LayoutKind; owner: string; text?: string; rect: Box2 };

/** Pílula de texto centrada em (cx, cy): 15 px de altura, como desenhada pelo renderizador. */
export function pillBox(cx: number, cy: number, w: number): Box2 {
  return { x0: cx - w / 2, y0: cy - 8, x1: cx + w / 2, y1: cy + 7 };
}

/** Posições locais (relativas à base do cubo) do label, do medidor e dos badges de uma caixa. */
export function boxStack(b: IsoBox) {
  const { edge: s, h } = BOX_SIZE[b.size ?? "md"];
  let top = -14 * s - h - 6;
  const meterY = typeof b.meter === "number" ? top - 4 : undefined;
  if (typeof b.meter === "number") top -= 9;
  const badgeYs = (b.badges ?? []).map(() => {
    top -= BADGE_H + BADGE_GAP;
    return top;
  });
  return { labelY: 14 * s + 13, meterY, badgeYs };
}

export type FlowGeometry = { points: [number, number][]; label?: string; id: string };

/** Âncoras e caminhos dos fluxos do palco (os que referenciam ids inexistentes são ignorados). */
export function flowGeometries(stage: IsoStage, resolved: Map<string, Resolved>): FlowGeometry[] {
  return (stage.flows ?? []).flatMap((f) => {
    const ids = [f.from, ...(f.via ?? []), f.to];
    const rs = ids.map((id) => resolved.get(id));
    if (rs.some((r) => !r)) return [];
    return [{ id: ids.join(">"), points: rs.map((r) => anchorOf(r as Resolved)), label: f.label }];
  });
}

/** Todos os retângulos relevantes do palco, em coordenadas de tela. Fonte única para câmera e checador. */
export function isoLayout(stage: IsoStage): LayoutItem[] {
  const out: LayoutItem[] = [];
  const resolved = resolveEntities(stage.entities);
  for (const r of resolved.values()) {
    const e = r.ent;
    const [ox, oy] = originOf(r);
    if (e.type === "box") {
      const { edge: s, h } = BOX_SIZE[e.size ?? "md"];
      out.push({ kind: "cube", owner: e.id, rect: { x0: ox - 28 * s, y0: oy - 14 * s - h, x1: ox + 28 * s, y1: oy + 14 * s } });
      const st = boxStack(e);
      out.push({ kind: "label", owner: e.id, text: e.label, rect: pillBox(ox, oy + st.labelY, labelWidth(e.label)) });
      if (st.meterY !== undefined) out.push({ kind: "meter", owner: e.id, rect: { x0: ox - 18, y0: oy + st.meterY, x1: ox + 18, y1: oy + st.meterY + 4 } });
      (e.badges ?? []).forEach((b, i) => {
        const w = badgeWidth(b.text);
        out.push({ kind: "badge", owner: e.id, text: b.text, rect: { x0: ox - w / 2, y0: oy + st.badgeYs[i], x1: ox + w / 2, y1: oy + st.badgeYs[i] + BADGE_H } });
      });
    } else if (e.type === "zone") {
      if (e.label) {
        const [lx, ly] = zoneLabelPos(e);
        out.push({ kind: "zone-label", owner: e.id, text: e.label, rect: pillBox(ox + lx, oy + ly, labelWidth(e.label)) });
      }
    } else {
      const { w, d } = usersLayout(e);
      const pts = [project(-w / 2, -d / 2), project(w / 2, -d / 2), project(w / 2, d / 2), project(-w / 2, d / 2)];
      out.push({
        kind: "cube",
        owner: e.id,
        rect: {
          x0: ox + Math.min(...pts.map((p) => p[0])),
          x1: ox + Math.max(...pts.map((p) => p[0])),
          y0: oy + Math.min(...pts.map((p) => p[1])) - USERS_PLATFORM_TH - 24,
          y1: oy + Math.max(...pts.map((p) => p[1])),
        },
      });
      if (e.label) out.push({ kind: "label", owner: e.id, text: e.label, rect: pillBox(ox, oy + project(w / 2, d / 2)[1] + 14, labelWidth(e.label)) });
    }
  }
  for (const l of stage.links ?? []) {
    const a = resolved.get(l.from);
    const b = resolved.get(l.to);
    if (!a || !b || !l.label) continue;
    const [ax, ay] = anchorOf(a);
    const [bx, by] = anchorOf(b);
    out.push({ kind: "link-label", owner: `${l.from}>${l.to}`, text: l.label, rect: pillBox((ax + bx) / 2, (ay + by) / 2, linkLabelWidth(l.label)) });
  }
  for (const f of flowGeometries(stage, resolved)) {
    if (!f.label) continue;
    const mid = pointAt(f.points, 0.5);
    out.push({ kind: "flow-label", owner: f.id, text: f.label, rect: pillBox(mid.x, mid.y - 9, flowLabelWidth(f.label)) });
  }
  return out;
}

/** Retângulo (px, antes da margem) que contém tudo: formas, labels, badges e medidores. */
export function bounds(stage: IsoStage): Rect {
  const rect: Rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    if (x < rect.minX) rect.minX = x;
    if (x > rect.maxX) rect.maxX = x;
    if (y < rect.minY) rect.minY = y;
    if (y > rect.maxY) rect.maxY = y;
  };
  for (const item of isoLayout(stage)) {
    add(item.rect.x0, item.rect.y0);
    add(item.rect.x1, item.rect.y1);
  }
  for (const r of resolveEntities(stage.entities).values()) {
    const e = r.ent;
    if (e.type !== "zone") continue;
    const [ox, oy] = originOf(r);
    const th = e.th ?? ZONE_TH;
    const pts: [number, number][] = [
      [0, 0],
      [e.w * (TW / 2), e.w * (TH / 2)],
      [(e.w - e.d) * (TW / 2), (e.w + e.d) * (TH / 2)],
      [-e.d * (TW / 2), e.d * (TH / 2)],
    ];
    for (const [px, py] of pts) {
      add(ox + px, oy + py - th);
      add(ox + px, oy + py);
    }
  }
  if (![rect.minX, rect.maxX, rect.minY, rect.maxY].every(Number.isFinite)) return { minX: NaN, minY: NaN, maxX: NaN, maxY: NaN };
  return rect;
}

/** Foco padrão do modo aproximado: entidades bad/new/hi e as pontas de fluxos bad; null se não houver nenhuma. */
export function defaultFocus(stage: IsoStage): string[] | null {
  const ids = new Set<string>();
  for (const e of stage.entities) if (e.status === "bad" || e.status === "new" || e.status === "hi") ids.add(e.id);
  for (const f of stage.flows ?? []) if (f.kind === "bad") ids.add(f.from), ids.add(f.to);
  return ids.size ? [...ids] : null;
}

/** Retângulo das entidades em `ids` (cubos, labels, badges e zonas), com um tamanho mínimo para manter contexto. */
export function focusBounds(stage: IsoStage, ids: string[]): Rect | null {
  const want = new Set(ids);
  const rect: Rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    rect.minX = Math.min(rect.minX, x);
    rect.maxX = Math.max(rect.maxX, x);
    rect.minY = Math.min(rect.minY, y);
    rect.maxY = Math.max(rect.maxY, y);
  };
  for (const item of isoLayout(stage)) {
    if (want.has(item.owner)) {
      add(item.rect.x0, item.rect.y0);
      add(item.rect.x1, item.rect.y1);
    }
  }
  for (const r of resolveEntities(stage.entities).values()) {
    if (r.ent.type !== "zone" || !want.has(r.ent.id)) continue;
    const [ox, oy] = originOf(r);
    const z = r.ent;
    add(ox - z.d * (TW / 2), oy - (z.th ?? ZONE_TH));
    add(ox + z.w * (TW / 2), oy + (z.w + z.d) * (TH / 2));
  }
  if (!Number.isFinite(rect.minX)) return null;
  const MIN_W = 300;
  const MIN_H = 220;
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;
  const w = Math.max(MIN_W, rect.maxX - rect.minX);
  const h = Math.max(MIN_H, rect.maxY - rect.minY);
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2 };
}

export function isBox(e: IsoEntity): e is IsoBox {
  return e.type === "box";
}
export function isZone(e: IsoEntity): e is IsoZone {
  return e.type === "zone";
}
