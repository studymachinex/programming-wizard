/**
 * Roda todos os exercícios e atividades com o runner da plataforma:
 * a solução de referência precisa passar em todos os testes e o starter precisa compilar e falhar.
 *
 * Uso: npx tsx scripts/check-exercises.ts [filtro-de-slug]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { runJavaTests, type RunResult } from "../lib/runner/java";

type Item = { slug: string; starterCode: string; solutionCode: string; tests: string; where: string };

async function collect(): Promise<Item[]> {
  const items: Item[] = [];
  const tracksDir = path.join("content", "tracks");
  for (const track of await fs.readdir(tracksDir)) {
    for (const sub of ["exercises", "activities"]) {
      const dir = path.join(tracksDir, track, sub);
      const files = await fs.readdir(dir).catch(() => [] as string[]);
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        const data = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
        const list = Array.isArray(data) ? data : [data];
        for (const item of list) if (item.tests && item.solutionCode) items.push({ ...item, where: `${track}/${sub}/${file}` });
      }
    }
  }
  return items;
}

const summary = (r: RunResult) =>
  r.status === "compile_error" ? `não compila: ${r.raw.split("\n").slice(0, 3).join(" ")}` : r.status === "error" ? r.message.slice(0, 300) : r.tests.filter((t) => t.status !== "passed").map((t) => `${t.display}: ${t.message?.split("\n")[0]}`).join(" | ");

async function main() {
  const filter = process.argv[2];
  const items = (await collect()).filter((i) => !filter || i.slug.includes(filter));
  const problems: string[] = [];
  let done = 0;
  const started = Date.now();
  await Promise.all(
    items.map(async (item) => {
      const sol = await runJavaTests({ code: item.solutionCode, tests: item.tests });
      if (sol.status !== "passed") problems.push(`✗ ${item.slug} (${item.where}): a solução não passa — ${summary(sol)}`);
      const starter = await runJavaTests({ code: item.starterCode, tests: item.tests });
      if (starter.status === "compile_error") problems.push(`✗ ${item.slug}: o starter não compila — ${summary(starter)}`);
      else if (starter.status === "passed") problems.push(`✗ ${item.slug}: o starter já passa em todos os testes`);
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${items.length}...`);
    }),
  );
  console.log(`${items.length} itens verificados em ${Math.round((Date.now() - started) / 1000)} s.`);
  if (problems.length) {
    console.log(problems.sort().join("\n"));
    process.exitCode = 1;
  } else console.log("✓ todas as soluções passam e todos os starters falham");
}

main();
