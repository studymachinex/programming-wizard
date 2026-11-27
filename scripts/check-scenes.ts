/**
 * Confere todas as cenas registradas: limites de texto e de passos, ids, referências do modo
 * isométrico, da sequência e das camadas, e se os comandos sugeridos do terminal produzem saída.
 * Também confere que cada chave aponta para uma trilha e aula existentes e a cobertura das trilhas
 * em REQUIRED_TRACKS (começa vazia na Fase 0; acrescente a trilha ao concluir cada fase).
 *
 * Uso: npx tsx scripts/check-scenes.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { SCENE_KEYS, loadScene } from "../lib/scenes/registry";
import { computeChanges } from "../lib/scenes/diff";
import { bounds, isoLayout, type Box2, type LayoutItem } from "../lib/scenes/iso";
import { resolveCommand } from "../lib/scenes/terminal";
import type { IsoStage, LayersStage, SceneDef, SceneStep, SeqMessage, SequenceStage } from "../lib/scenes/types";

/** Trilhas cujas aulas todas precisam ter cena: "redes-backend" (Fase 1), "docker" (Fase 2), "kubernetes" (Fase 3). */
const REQUIRED_TRACKS: string[] = ["redes-backend"];

const TRACKS_DIR = path.join(process.cwd(), "content", "tracks");

type Manifest = { modules: { lessons: { slug: string }[] }[] };

async function lessonSlugs(track: string): Promise<Set<string> | null> {
  try {
    const raw = await fs.readFile(path.join(TRACKS_DIR, track, "track.json"), "utf8");
    const manifest = JSON.parse(raw) as Manifest;
    return new Set(manifest.modules.flatMap((m) => m.lessons.map((l) => l.slug)));
  } catch {
    return null;
  }
}

function dup(ids: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) out.add(id);
    seen.add(id);
  }
  return [...out];
}

function checkIso(stage: IsoStage, where: string, errors: string[]) {
  const ids = stage.entities.map((e) => e.id);
  for (const d of dup(ids)) errors.push(`${where}: id duplicado "${d}"`);
  const byId = new Map(stage.entities.map((e) => [e.id, e]));
  for (const e of stage.entities) {
    if (e.type === "box") {
      if (e.parent) {
        const p = byId.get(e.parent);
        if (!p) errors.push(`${where}: box "${e.id}" com parent inexistente "${e.parent}"`);
        else if (p.type !== "zone") errors.push(`${where}: parent "${e.parent}" de "${e.id}" não é zona`);
      }
      if ((e.badges?.length ?? 0) > 2) errors.push(`${where}: box "${e.id}" com mais de 2 badges`);
      if (e.meter !== undefined && (e.meter < 0 || e.meter > 100)) errors.push(`${where}: meter de "${e.id}" fora de 0..100`);
    }
    if (e.type === "users" && (e.count < 1 || e.count > 9)) errors.push(`${where}: users "${e.id}" com count fora de 1..9`);
  }
  for (const l of stage.links ?? []) {
    for (const ref of [l.from, l.to]) if (!byId.has(ref)) errors.push(`${where}: link ${l.from}->${l.to} referencia "${ref}" inexistente`);
  }
  for (const f of stage.flows ?? []) {
    for (const ref of [f.from, f.to, ...(f.via ?? [])]) if (!byId.has(ref)) errors.push(`${where}: fluxo ${f.from}->${f.to} referencia "${ref}" inexistente`);
  }
  const b = bounds(stage);
  if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) errors.push(`${where}: bounds não finito (coordenadas inválidas ou palco vazio)`);
  else checkOverlap(stage, where, errors);
}

const TEXT_KINDS = new Set(["label", "badge", "zone-label", "link-label", "flow-label"]);
const OVERLAP_PX = 2;

function overlaps(a: Box2, b: Box2): boolean {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > OVERLAP_PX && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > OVERLAP_PX;
}

const KIND_PT: Record<string, string> = { label: "label", badge: "badge", "zone-label": "label da zona", "link-label": "label do link", "flow-label": "label do fluxo", cube: "cubo" };
const describe = (i: LayoutItem) => `${KIND_PT[i.kind]} ${i.text ? `"${i.text}"` : ""} de ${i.owner}`.replace("  ", " ");

/** Dois textos não podem se cruzar (mais de 2 px) e um texto não pode cobrir o cubo de outra entidade. */
function checkOverlap(stage: IsoStage, where: string, errors: string[]) {
  const items = isoLayout(stage);
  const texts = items.filter((i) => TEXT_KINDS.has(i.kind));
  const cubes = items.filter((i) => i.kind === "cube");
  for (let a = 0; a < texts.length; a++) {
    for (let b = a + 1; b < texts.length; b++) {
      if (overlaps(texts[a].rect, texts[b].rect)) errors.push(`${where}: sobreposição entre ${describe(texts[a])} e ${describe(texts[b])}`);
    }
    for (const c of cubes) {
      if (c.owner === texts[a].owner) continue;
      if (overlaps(texts[a].rect, c.rect)) errors.push(`${where}: ${describe(texts[a])} cobre o cubo de ${c.owner}`);
    }
  }
}

function checkSequence(stage: SequenceStage, where: string, errors: string[]) {
  const lanes = new Set(stage.lanes.map((l) => l.id));
  for (const d of dup(stage.lanes.map((l) => l.id))) errors.push(`${where}: lane duplicada "${d}"`);
  for (const d of dup(stage.messages.map((m) => m.id))) errors.push(`${where}: id de mensagem duplicado "${d}"`);
  for (const m of stage.messages) {
    if (!lanes.has(m.from) || !lanes.has(m.to)) errors.push(`${where}: mensagem "${m.id}" com lane inexistente (${m.from} -> ${m.to})`);
    if (m.at < 0) errors.push(`${where}: mensagem "${m.id}" com at negativo`);
  }
  for (const n of stage.notes ?? []) if (!lanes.has(n.lane)) errors.push(`${where}: nota em lane inexistente "${n.lane}"`);

  // Com linhas de 32 px, o `detail` (abaixo da seta) de uma mensagem encosta no label (acima da seta) da
  // próxima se ela começar só 1 linha depois e as duas cruzarem a mesma faixa horizontal. Exige 2 linhas.
  const order = new Map(stage.lanes.map((l, i) => [l.id, i]));
  const span = (m: SeqMessage) => [Math.min(order.get(m.from) ?? 0, order.get(m.to) ?? 0), Math.max(order.get(m.from) ?? 0, order.get(m.to) ?? 0)] as const;
  for (const a of stage.messages) {
    if (!a.detail || a.from === a.to) continue;
    const bottom = a.at + (a.span ?? 0);
    const [a0, a1] = span(a);
    for (const b of stage.messages) {
      if (b === a || b.from === b.to || b.at <= bottom || b.at - bottom >= 2) continue;
      const [b0, b1] = span(b);
      if (a0 < b1 && b0 < a1) errors.push(`${where}: o detail de "${a.id}" encosta no label de "${b.id}" (deixe 2 linhas entre o fim de "${a.id}" e o início de "${b.id}")`);
    }
  }
}

function checkLayers(stage: LayersStage, where: string, errors: string[]) {
  if (stage.stacks.length < 1 || stage.stacks.length > 3) errors.push(`${where}: ${stage.stacks.length} pilhas (esperado 1 a 3)`);
  for (const d of dup(stage.stacks.map((s) => s.id))) errors.push(`${where}: id de pilha duplicado "${d}"`);
  const stackIds = new Set(stage.stacks.map((s) => s.id));
  for (const s of stage.stacks) {
    for (const d of dup(s.layers.map((l) => l.id))) errors.push(`${where}: layer duplicada "${d}" na pilha "${s.id}"`);
    const layerIds = new Set(s.layers.map((l) => l.id));
    for (const f of s.merged?.files ?? []) if (!layerIds.has(f.from)) errors.push(`${where}: merged.files "${f.name}" aponta para layer "${f.from}" que não está na pilha "${s.id}"`);
  }
  for (const w of stage.wires ?? []) if (!stackIds.has(w.from) || !stackIds.has(w.to)) errors.push(`${where}: wire ${w.from}->${w.to} com pilha inexistente`);
}

function checkFocus(step: SceneStep, where: string, errors: string[]) {
  if (!step.focus) return;
  if (step.stage.mode !== "iso") {
    errors.push(`${where}: focus só vale no modo iso`);
    return;
  }
  const ids = new Set(step.stage.entities.map((e) => e.id));
  for (const id of step.focus) if (!ids.has(id)) errors.push(`${where}: focus referencia "${id}" inexistente`);
}

function checkStep(step: SceneStep, index: number, total: number, def: SceneDef, key: string, errors: string[]) {
  const where = `${key} passo ${index + 1}`;
  if (!step.title?.trim()) errors.push(`${where}: sem title`);
  if (!step.nav?.trim()) errors.push(`${where}: nav vazio`);
  else if (step.nav.length > 18) errors.push(`${where}: nav "${step.nav}" com ${step.nav.length} caracteres (máx. 18)`);
  if (!step.body?.length) errors.push(`${where}: body vazio`);
  else {
    if (step.body.length > 3) errors.push(`${where}: body com ${step.body.length} parágrafos (máx. 3)`);
    step.body.forEach((p, i) => {
      if (p.length > 420) errors.push(`${where}: parágrafo ${i + 1} com ${p.length} caracteres (máx. 420)`);
    });
  }
  if ((step.metrics?.length ?? 0) > 4) errors.push(`${where}: mais de 4 métricas`);
  if (index === 0 && step.kind !== "contexto" && step.kind !== "problema") errors.push(`${where}: o primeiro passo deve ser contexto ou problema`);
  if (index === total - 1 && step.kind !== "resumo") errors.push(`${where}: o último passo deve ser resumo`);

  switch (step.stage.mode) {
    case "iso":
      checkIso(step.stage, where, errors);
      break;
    case "sequence":
      checkSequence(step.stage, where, errors);
      break;
    case "layers":
      checkLayers(step.stage, where, errors);
      break;
    default:
      errors.push(`${where}: modo de palco desconhecido`);
  }

  checkFocus(step, where, errors);

  if (def.shell) {
    for (const cmd of step.terminal?.suggest ?? []) {
      const r = resolveCommand(cmd, step, def);
      if (!r.known) errors.push(`${where}: comando sugerido "${cmd}" não produz saída`);
    }
  }
}

async function main() {
  const errors: string[] = [];
  let scenes = 0;
  let steps = 0;

  // chaves duplicadas no registro (um objeto literal não denuncia isso em tempo de execução)
  const source = await fs.readFile(path.join(process.cwd(), "lib", "scenes", "registry.ts"), "utf8");
  const declared = [...source.matchAll(/^\s*"([^"]+\/[^"]+)":/gm)].map((m) => m[1]);
  for (const d of dup(declared)) errors.push(`registro: duas cenas para a chave "${d}"`);

  const trackCache = new Map<string, Set<string> | null>();
  const covered = new Set<string>();

  for (const key of SCENE_KEYS) {
    const [track, lesson] = key.split("/");
    if (!trackCache.has(track)) trackCache.set(track, await lessonSlugs(track));
    const slugs = trackCache.get(track);
    if (!slugs) errors.push(`${key}: a trilha "${track}" não existe em content/tracks`);
    else if (!slugs.has(lesson)) errors.push(`${key}: a aula "${lesson}" não existe na trilha "${track}"`);
    covered.add(key);

    let def: SceneDef | null = null;
    try {
      def = await loadScene(track, lesson);
    } catch (error) {
      errors.push(`${key}: lançou exceção ao carregar (${(error as Error).message})`);
      continue;
    }
    if (!def) {
      errors.push(`${key}: não carregou`);
      continue;
    }
    scenes += 1;
    const n = def.steps.length;
    steps += n;
    if (n < 6 || n > 14) errors.push(`${key}: ${n} passos (esperado 6 a 14)`);
    if (def.goals.length < 1 || def.goals.length > 4) errors.push(`${key}: ${def.goals.length} objetivos (esperado 1 a 4)`);
    for (const g of def.goals) if (g.step < 1 || g.step > n) errors.push(`${key}: objetivo "${g.text}" com step ${g.step} fora de 1..${n}`);
    def.steps.forEach((step, i) => {
      try {
        checkStep(step, i, n, def!, key, errors);
        computeChanges(i > 0 ? def!.steps[i - 1] : null, step);
      } catch (error) {
        errors.push(`${key} passo ${i + 1}: exceção (${(error as Error).message})`);
      }
    });
  }

  // cobertura
  for (const track of REQUIRED_TRACKS) {
    const slugs = await lessonSlugs(track);
    if (!slugs) {
      errors.push(`cobertura: trilha "${track}" não existe`);
      continue;
    }
    for (const lesson of slugs) if (!covered.has(`${track}/${lesson}`)) errors.push(`cobertura: ${track}/${lesson} não tem cena`);
  }

  if (errors.length) {
    console.error(`❌ ${errors.length} problema(s) nas cenas:\n` + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`✅ ${scenes} cenas, ${steps} passos`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
