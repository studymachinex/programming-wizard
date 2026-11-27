/**
 * "O que mudou" automático entre dois passos de uma cena. Função pura.
 */
import type { IsoEntity, IsoStage, LayersStage, SceneStep, SequenceStage, Status } from "./types";

export const STATUS_PT: Record<Status, string> = {
  ok: "saudável",
  new: "novo",
  warn: "atenção",
  bad: "com falha",
  dead: "fora do ar",
  muted: "inativo",
  hi: "em destaque",
};

const MAX_ITEMS = 4;

function labelOf(e: IsoEntity): string | undefined {
  return e.type === "users" ? e.label : e.label;
}

function isoItems(prev: IsoStage, next: IsoStage): { entities: string[]; status: string[]; flows: string[] } {
  const before = new Map(prev.entities.map((e) => [e.id, e]));
  const after = new Map(next.entities.map((e) => [e.id, e]));
  const entities: string[] = [];
  const status: string[] = [];
  for (const [id, e] of after) {
    const label = labelOf(e);
    if (!label) continue;
    if (!before.has(id)) entities.push(`+ ${label}`);
  }
  for (const [id, e] of before) {
    const label = labelOf(e);
    if (!label) continue;
    if (!after.has(id)) entities.push(`− ${label}`);
  }
  for (const [id, e] of after) {
    const old = before.get(id);
    const label = labelOf(e);
    if (!old || !label) continue;
    const a = old.status ?? "ok";
    const b = e.status ?? "ok";
    // "novo" é uma marca passageira: virar "saudável" no passo seguinte não é uma mudança a destacar.
    if (a !== b && !(a === "new" && b === "ok")) status.push(`${label}: ${STATUS_PT[b]}`);
  }
  const hadBad = (prev.flows ?? []).some((f) => f.kind === "bad");
  const hasBad = (next.flows ?? []).some((f) => f.kind === "bad");
  const flows: string[] = [];
  if (hasBad && !hadBad) flows.push("Requisições falhando");
  if (!hasBad && hadBad) flows.push("Falhas cessaram");
  return { entities, status, flows };
}

function layerKey(stackId: string, layerId: string) {
  return `${stackId}/${layerId}`;
}

function layerItems(prev: LayersStage, next: LayersStage): { status: string[]; added: string[] } {
  const before = new Map<string, { label: string; status: Status }>();
  const after = new Map<string, { label: string; status: Status }>();
  const added: string[] = [];
  const prevStacks = new Set(prev.stacks.map((s) => s.id));
  const nextStacks = new Set(next.stacks.map((s) => s.id));
  for (const s of prev.stacks) for (const l of s.layers) before.set(layerKey(s.id, l.id), { label: l.label, status: l.status ?? "ok" });
  for (const s of next.stacks) for (const l of s.layers) after.set(layerKey(s.id, l.id), { label: l.label, status: l.status ?? "ok" });
  for (const s of next.stacks) if (!prevStacks.has(s.id)) added.push(`+ ${s.label}`);
  for (const s of prev.stacks) if (!nextStacks.has(s.id)) added.push(`− ${s.label}`);
  for (const s of next.stacks) {
    if (!prevStacks.has(s.id)) continue;
    for (const l of s.layers) if (!before.has(layerKey(s.id, l.id))) added.push(`+ ${l.label}`);
  }
  for (const s of prev.stacks) {
    if (!nextStacks.has(s.id)) continue;
    for (const l of s.layers) if (!after.has(layerKey(s.id, l.id))) added.push(`− ${l.label}`);
  }
  const status: string[] = [];
  for (const [key, cur] of after) {
    const old = before.get(key);
    if (old && old.status !== cur.status && !(old.status === "new" && cur.status === "ok")) status.push(`${cur.label}: ${STATUS_PT[cur.status]}`);
  }
  return { status, added };
}

function seqItems(prev: SequenceStage, next: SequenceStage): string[] {
  const seen = new Set(prev.messages.map((m) => m.id));
  return next.messages.filter((m) => !seen.has(m.id)).map((m) => `+ ${m.label}`);
}

/**
 * No primeiro passo devolve []. Se `next.changes` existir, ele vence. Senão gera até 4 itens,
 * por prioridade: métricas, entidades, status, fluxos ruins e (sequência/camadas) itens novos.
 * Se o modo do palco mudou entre os passos devolve [] (o texto do passo explica a troca).
 */
export function computeChanges(prev: SceneStep | null, next: SceneStep): string[] {
  if (!prev) return [];
  if (next.changes) return next.changes;
  if (prev.stage.mode !== next.stage.mode) return [];

  const items: string[] = [];

  const oldMetrics = new Map((prev.metrics ?? []).map((m) => [m.id, m]));
  for (const m of next.metrics ?? []) {
    const old = oldMetrics.get(m.id);
    if (old && String(old.value) !== String(m.value)) items.push(`${m.label} ${old.value} → ${m.value}`);
  }

  if (prev.stage.mode === "iso" && next.stage.mode === "iso") {
    const iso = isoItems(prev.stage, next.stage);
    items.push(...iso.entities, ...iso.status, ...iso.flows);
  } else if (prev.stage.mode === "layers" && next.stage.mode === "layers") {
    const layers = layerItems(prev.stage, next.stage);
    items.push(...layers.status, ...layers.added);
  } else if (prev.stage.mode === "sequence" && next.stage.mode === "sequence") {
    items.push(...seqItems(prev.stage, next.stage));
  }

  return [...new Set(items)].slice(0, MAX_ITEMS);
}
