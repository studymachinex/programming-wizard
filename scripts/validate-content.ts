import { promises as fs } from "node:fs";
import path from "node:path";
import {
  activitiesFileSchema,
  exerciseSchema,
  problemsFileSchema,
  projectsFileSchema,
  trackSchema,
} from "../lib/content-schema";

const CONTENT_DIR = path.join(process.cwd(), "content");
const TRACKS_DIR = path.join(CONTENT_DIR, "tracks");
const PROBLEMS_DIR = path.join(CONTENT_DIR, "problems");

let errors = 0;
let warnings = 0;

function fail(msg: string) {
  errors += 1;
  console.error(`❌ ${msg}`);
}
function warn(msg: string) {
  warnings += 1;
  console.warn(`⚠️  ${msg}`);
}

async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const dirs = (await fs.readdir(TRACKS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const exerciseSlugs = new Set<string>();
  const activitySlugs = new Set<string>();
  let totalActivities = 0;
  const problemSlugs = new Map<string, string>();
  let totalLessons = 0;
  let totalExercises = 0;
  let totalProblems = 0;
  let totalWords = 0;

  for (const dir of dirs) {
    const base = path.join(TRACKS_DIR, dir);
    const manifestPath = path.join(base, "track.json");
    let manifest;
    try {
      manifest = trackSchema.parse(await readJson(manifestPath));
    } catch (e) {
      fail(`${dir}: manifesto inválido — ${(e as Error).message}`);
      continue;
    }
    if (manifest.slug !== dir) fail(`${dir}: slug do manifesto é "${manifest.slug}"`);

    const moduleSlugs = new Set<string>();
    const lessonSlugs = new Set<string>();

    for (const mod of manifest.modules) {
      if (moduleSlugs.has(mod.slug)) fail(`${dir}: módulo duplicado "${mod.slug}"`);
      moduleSlugs.add(mod.slug);
      if (!mod.exercises.length) warn(`${dir}/${mod.slug}: sem exercício local`);

      for (const lesson of mod.lessons) {
        if (lessonSlugs.has(lesson.slug)) fail(`${dir}: aula duplicada "${lesson.slug}"`);
        lessonSlugs.add(lesson.slug);
        if (!lesson.file.startsWith("lessons/")) warn(`${dir}/${lesson.slug}: file fora de lessons/`);
        try {
          const content = await fs.readFile(path.join(base, lesson.file), "utf8");
          const words = content.trim().split(/\s+/).length;
          totalWords += words;
          if (words < 550) warn(`${dir}/${lesson.slug}: apenas ${words} palavras`);
          if (/^# /m.test(content)) warn(`${dir}/${lesson.slug}: contém H1 no markdown`);
          if (!/```java/.test(content)) warn(`${dir}/${lesson.slug}: sem bloco Java`);
        } catch {
          fail(`${dir}: aula ausente ${lesson.file}`);
        }
        try {
          const activities = activitiesFileSchema.parse(await readJson(path.join(base, "activities", `${lesson.slug}.json`)));
          for (const a of activities) {
            if (activitySlugs.has(a.slug)) fail(`atividade duplicada global: ${a.slug}`);
            activitySlugs.add(a.slug);
            totalActivities += 1;
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") fail(`${dir}/${lesson.slug}: atividades inválidas — ${(e as Error).message}`);
        }
        for (const [qi, q] of (lesson.quiz ?? []).entries()) {
          if (q.answer < 0 || q.answer >= q.options.length) {
            fail(`${dir}/${lesson.slug}: quiz ${qi} com answer fora do intervalo`);
          }
        }
      }

      for (const ex of mod.exercises) {
        try {
          const parsed = exerciseSchema.parse(await readJson(path.join(base, ex)));
          totalExercises += 1;
          if (exerciseSlugs.has(parsed.slug)) fail(`exercício duplicado global: ${parsed.slug}`);
          exerciseSlugs.add(parsed.slug);
          if (!parsed.tests.includes("@Test")) warn(`${ex}: testes sem @Test`);
          if (!parsed.statement.includes("## Restri")) warn(`${ex}: enunciado sem seção de restrições`);
        } catch (e) {
          fail(`${dir}: exercício inválido ${ex} — ${(e as Error).message}`);
        }
      }
      totalLessons += mod.lessons.length;
    }

    const problemsPath = path.join(PROBLEMS_DIR, `${dir}.json`);
    try {
      const problems = problemsFileSchema.parse(await readJson(problemsPath));
      totalProblems += problems.length;
      for (const p of problems) {
        if (problemSlugs.has(p.slug)) {
          fail(`problema duplicado global: ${p.slug} (${dir} e ${problemSlugs.get(p.slug)})`);
        }
        problemSlugs.set(p.slug, dir);
        if (p.platform === "LeetCode" && !p.url.includes("leetcode.com/problems/")) {
          warn(`${dir}/${p.slug}: URL de LeetCode suspeita`);
        }
        if (p.platform === "Beecrowd" && !p.url.includes("beecrowd.com")) {
          warn(`${dir}/${p.slug}: URL de Beecrowd suspeita`);
        }
      }
    } catch (e) {
      fail(`${dir}: arquivo de problemas ausente/inválido (${(e as Error).message})`);
    }
  }

  try {
    const projects = projectsFileSchema.parse(await readJson(path.join(CONTENT_DIR, "projects.json")));
    console.log(`\n📦 Projetos: ${projects.length}`);
  } catch {
    warn("content/projects.json ausente ou inválido");
  }

  console.log(
    `\n📚 ${dirs.length} trilhas · ${totalLessons} aulas · ${totalExercises} exercícios · ${totalActivities} atividades · ${totalProblems} problemas · ~${Math.round(
      totalWords / 1000
    )}k palavras`
  );
  console.log(errors ? `\n💥 ${errors} erro(s), ${warnings} aviso(s)` : `\n✅ Conteúdo válido (${warnings} aviso(s))`);
  if (errors) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
