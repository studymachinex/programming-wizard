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

// ---------- limites ----------

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

export function labelWidth(text: string, charW = 5.8, pad = 12) {
  return text.length * charW + pad;
}

export const BADGE_H = 16;
export const BADGE_GAP = 2;

export function badgeWidth(text: string) {
  return labelWidth(text, 5.3, 12);
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
  const resolved = resolveEntities(stage.entities);
  for (const r of resolved.values()) {
    const e = r.ent;
    const [ox, oy] = originOf(r);
    if (e.type === "zone") {
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
      if (e.label) {
        const [lx, ly] = zoneLabelPos(e);
        const fx = ox + lx;
        const fy = oy + ly;
        const lw = labelWidth(e.label);
        add(fx - lw / 2, fy - 8);
        add(fx + lw / 2, fy + 8);
      }
    } else if (e.type === "box") {
      const { edge, h } = BOX_SIZE[e.size ?? "md"];
      add(ox, oy - 14 * edge - h);
      add(ox + 28 * edge, oy - h);
      add(ox - 28 * edge, oy - h);
      add(ox, oy + 14 * edge);
      const lw = labelWidth(e.label);
      add(ox - lw / 2, oy + 14 * edge + 20);
      add(ox + lw / 2, oy + 14 * edge + 20);
      let top = oy - 14 * edge - h - 6;
      if (typeof e.meter === "number") top -= 9;
      const badges = e.badges ?? [];
      for (let i = 0; i < badges.length; i++) {
        const bw = badgeWidth(badges[i].text);
        top -= BADGE_H + BADGE_GAP;
        add(ox - bw / 2, top);
        add(ox + bw / 2, top + BADGE_H);
      }
      add(ox, top);
    } else {
      const { w, d } = usersLayout(e);
      const th = USERS_PLATFORM_TH;
      for (const [px, py] of [
        project(-w / 2, -d / 2),
        project(w / 2, -d / 2),
        project(w / 2, d / 2),
        project(-w / 2, d / 2),
      ]) {
        add(ox + px, oy + py - th - 24);
        add(ox + px, oy + py);
      }
      if (e.label) {
        const lw = labelWidth(e.label);
        const fy = oy + project(w / 2, d / 2)[1] + 14;
        add(ox - lw / 2, fy - 8);
        add(ox + lw / 2, fy + 8);
      }
    }
  }
  if (!Number.isFinite(rect.minX) || !Number.isFinite(rect.maxX) || !Number.isFinite(rect.minY) || !Number.isFinite(rect.maxY)) {
    return { minX: NaN, minY: NaN, maxX: NaN, maxY: NaN };
  }
  return rect;
}

export function isBox(e: IsoEntity): e is IsoBox {
  return e.type === "box";
}
export function isZone(e: IsoEntity): e is IsoZone {
  return e.type === "zone";
}
