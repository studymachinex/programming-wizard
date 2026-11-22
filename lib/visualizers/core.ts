import type { Frame, Panel, Tone } from "./types";

/** Acumula quadros. Cada chamada de `step` vira um passo do player. */
export class Trace {
  readonly frames: Frame[] = [];

  step(caption: string, panels: Panel[], line?: number) {
    // Copia profunda: os geradores mutam estruturas entre passos.
    this.frames.push({ caption, line, panels: structuredCloneSafe(panels) });
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Tons para um conjunto de índices. */
export function tones(...groups: [Iterable<number>, Tone][]): Record<number, Tone> {
  const out: Record<number, Tone> = {};
  for (const [indices, tone] of groups) for (const i of indices) out[i] = tone;
  return out;
}

export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function randomArray(n: number, min = 1, max = 99): number[] {
  return Array.from({ length: n }, () => randInt(min, max));
}

export function uniqueRandom(n: number, min = 1, max = 99): number[] {
  const set = new Set<number>();
  while (set.size < n) set.add(randInt(min, max));
  return [...set];
}

/** Posiciona n nós num círculo, no espaço 100 x 60 dos grafos. */
export function circleLayout(ids: string[], cx = 50, cy = 30, r = 24): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  ids.forEach((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
    out[id] = { x: cx + r * 1.6 * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  return out;
}

export const INF_LABEL = "∞";
export const fmt = (n: number) => (n === Infinity ? INF_LABEL : n === -Infinity ? "-∞" : String(n));
