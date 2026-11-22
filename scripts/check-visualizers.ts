/**
 * Roda todos os visualizadores registrados e confere a estrutura dos quadros:
 * nenhum cenário pode lançar exceção, ficar sem quadros, apontar para uma linha de
 * pseudocódigo inexistente ou referenciar nós/arestas que não existem.
 * Também confere que toda aula das trilhas de algoritmos tem um visualizador.
 *
 * Uso: npx tsx scripts/check-visualizers.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { VISUALIZER_KEYS, loadVisualizer } from "../lib/visualizers/registry";
import type { Frame, Panel } from "../lib/visualizers/types";

const TRACKS = ["estruturas-dados", "algoritmos-avancados"];

function checkPanel(panel: Panel, where: string, errors: string[]) {
  switch (panel.kind) {
    case "graph": {
      const ids = new Set(panel.nodes.map((n) => n.id));
      for (const e of panel.edges) if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`${where}: aresta ${e.from}->${e.to} sem nó`);
      break;
    }
    case "array":
      for (const p of panel.pointers ?? []) if (p.index < 0 || p.index >= Math.max(1, panel.values.length)) errors.push(`${where}: ponteiro ${p.label}=${p.index} fora do array (${panel.values.length})`);
      break;
    case "grid":
      if (panel.colHeaders && panel.rows.some((r) => r.length !== panel.colHeaders!.length)) errors.push(`${where}: grid com linhas de tamanho diferente dos cabeçalhos`);
      break;
    default:
      break;
  }
}

async function main() {
  const errors: string[] = [];
  let frames = 0;
  for (const key of VISUALIZER_KEYS) {
    const [track, lesson] = key.split("/");
    const def = await loadVisualizer(track, lesson);
    if (!def) {
      errors.push(`${key}: não carregou`);
      continue;
    }
    const scenarios = [...def.scenarios, ...(def.random ? [def.random(), def.random(), def.random()] : [])];
    for (const scenario of scenarios) {
      let built: Frame[] = [];
      try {
        built = scenario.build();
      } catch (error) {
        errors.push(`${key} [${scenario.label}]: lançou ${(error as Error).stack}`);
        continue;
      }
      if (built.length < 2) errors.push(`${key} [${scenario.label}]: só ${built.length} quadro(s)`);
      built.forEach((frame, i) => {
        const where = `${key} [${scenario.label}] quadro ${i + 1}`;
        if (!frame.caption) errors.push(`${where}: sem legenda`);
        if (frame.line !== undefined && (!def.code || frame.line < 0 || frame.line >= def.code.length)) errors.push(`${where}: linha ${frame.line} fora do pseudocódigo`);
        if (JSON.stringify(frame).includes("null") && JSON.stringify(frame).includes("Infinity")) errors.push(`${where}: Infinity serializado`);
        for (const panel of frame.panels) checkPanel(panel, where, errors);
      });
      frames += built.length;
    }
  }

  // Cobertura: toda aula das trilhas de algoritmos precisa de visualizador.
  for (const track of TRACKS) {
    const manifest = JSON.parse(await fs.readFile(path.join("content", "tracks", track, "track.json"), "utf8"));
    for (const mod of manifest.modules) {
      for (const lesson of mod.lessons) {
        if (!VISUALIZER_KEYS.includes(`${track}/${lesson.slug}`)) errors.push(`sem visualizador: ${track}/${lesson.slug}`);
      }
    }
  }

  console.log(`${VISUALIZER_KEYS.length} visualizadores, ${frames} quadros gerados.`);
  if (errors.length) {
    console.log(errors.map((e) => `✗ ${e}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("✓ tudo certo");
  }
}

main();
