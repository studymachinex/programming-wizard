import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  exerciseSchema,
  problemsFileSchema,
  projectsFileSchema,
  trackSchema,
  type ExerciseManifest,
} from "../lib/content-schema";

const prisma = new PrismaClient();
const CONTENT_DIR = path.join(process.cwd(), "content");
const TRACKS_DIR = path.join(CONTENT_DIR, "tracks");
const PROBLEMS_DIR = path.join(CONTENT_DIR, "problems");

const reset = process.argv.includes("--reset");

function id(...parts: string[]) {
  return parts.join("_").replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function readJson(file: string) {
  const raw = await fs.readFile(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`JSON inválido em ${file}: ${(error as Error).message}`);
  }
}

async function main() {
  console.log("🧙 Seeding Programming Wizard...\n");
  await prisma.profile.upsert({
    where: { id: "local" },
    update: {},
    create: { id: "local", name: "Mago" },
  });

  if (reset) {
    console.log("⚠️  --reset: apagando conteúdo e progresso existentes.");
    await prisma.track.deleteMany();
    await prisma.project.deleteMany();
    await prisma.externalProblem.deleteMany();
  }

  const trackDirs = (await fs.readdir(TRACKS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const exerciseSlugs = new Set<string>();
  const problemIds = new Set<string>();
  const projectIds = new Set<string>();
  const lessonCounters: { counter: number; total: number }[] = [];
  const trackIdBySlug = new Map<string, string>();
  let trackCount = 0;
  let moduleCount = 0;
  let lessonTotal = 0;
  let exerciseTotal = 0;
  let problemTotal = 0;

  for (const dir of trackDirs) {
    const trackDir = path.join(TRACKS_DIR, dir);
    const manifestPath = path.join(trackDir, "track.json");
    let manifestRaw: unknown;
    try {
      manifestRaw = await readJson(manifestPath);
    } catch {
      console.warn(`   ↷ ignorando ${dir} (sem track.json)`);
      continue;
    }
    const parsed = trackSchema.safeParse(manifestRaw);
    if (!parsed.success) {
      console.error(`❌ ${manifestPath}`);
      console.error(parsed.error.issues.map((i) => `   ${i.path.join(".")}: ${i.message}`).join("\n"));
      throw new Error(`Manifesto inválido: ${manifestPath}`);
    }
    const track = parsed.data;
    if (track.slug !== dir) {
      throw new Error(`Pasta ${dir} deve ter o mesmo slug do manifesto (${track.slug}).`);
    }

    const trackId = id("t", track.slug);
    trackIdBySlug.set(track.slug, trackId);
    await prisma.track.upsert({
      where: { id: trackId },
      update: {
        slug: track.slug,
        title: track.title,
        subtitle: track.subtitle,
        description: track.description,
        level: track.level,
        icon: track.icon,
        accent: track.accent,
        order: trackCount,
        estimatedHours: track.estimatedHours,
        outcomes: track.outcomes,
        isCore: track.isCore,
      },
      create: {
        id: trackId,
        slug: track.slug,
        title: track.title,
        subtitle: track.subtitle,
        description: track.description,
        level: track.level,
        icon: track.icon,
        accent: track.accent,
        order: trackCount,
        estimatedHours: track.estimatedHours,
        outcomes: track.outcomes,
        isCore: track.isCore,
      },
    });
    trackCount += 1;

    let lessonOrder = 0;
    let exerciseOrder = 0;

    for (const [moduleIndex, mod] of track.modules.entries()) {
      const moduleId = id("m", track.slug, mod.slug);
      await prisma.module.upsert({
        where: { id: moduleId },
        update: {
          slug: mod.slug,
          title: mod.title,
          description: mod.description,
          order: moduleIndex,
          estimatedHours: mod.estimatedHours,
        },
        create: {
          id: moduleId,
          trackId,
          slug: mod.slug,
          title: mod.title,
          description: mod.description,
          order: moduleIndex,
          estimatedHours: mod.estimatedHours,
        },
      });
      moduleCount += 1;

      for (const lesson of mod.lessons) {
        const file = path.join(trackDir, lesson.file);
        let content: string;
        try {
          content = await fs.readFile(file, "utf8");
        } catch {
          throw new Error(`Aula não encontrada: ${lesson.file} (trilha ${track.slug})`);
        }
        if (content.trim().length < 400) {
          throw new Error(`Aula muito curta: ${lesson.file}`);
        }
        const lessonId = id("l", track.slug, mod.slug, lesson.slug);
        await prisma.lesson.upsert({
          where: { id: lessonId },
          update: {
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            order: lessonOrder,
            estimatedMinutes: lesson.minutes,
            content,
            takeaways: lesson.takeaways,
            quiz: lesson.quiz ?? undefined,
          },
          create: {
            id: lessonId,
            trackId,
            moduleId,
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            order: lessonOrder,
            estimatedMinutes: lesson.minutes,
            content,
            takeaways: lesson.takeaways,
            quiz: lesson.quiz ?? undefined,
          },
        });
        lessonOrder += 1;
        lessonTotal += 1;
      }

      for (const exercisePath of mod.exercises) {
        const file = path.join(trackDir, exercisePath);
        const raw = await readJson(file);
        const exParsed = exerciseSchema.safeParse(raw);
        if (!exParsed.success) {
          console.error(`❌ ${file}`);
          console.error(exParsed.error.issues.map((i) => `   ${i.path.join(".")}: ${i.message}`).join("\n"));
          throw new Error(`Exercício inválido: ${file}`);
        }
        const ex: ExerciseManifest = exParsed.data;
        if (exerciseSlugs.has(ex.slug)) {
          throw new Error(`Slug de exercício duplicado: ${ex.slug} (${file})`);
        }
        exerciseSlugs.add(ex.slug);
        const exerciseId = id("e", ex.slug);
        await prisma.exercise.upsert({
          where: { id: exerciseId },
          update: {
            trackId,
            moduleId,
            title: ex.title,
            difficulty: ex.difficulty,
            statement: ex.statement,
            starterCode: ex.starterCode,
            solutionCode: ex.solutionCode,
            tests: ex.tests,
            hints: ex.hints,
            tags: ex.tags,
            estimatedMinutes: ex.estimatedMinutes,
            externalUrl: ex.externalUrl ?? null,
            order: exerciseOrder,
          },
          create: {
            id: exerciseId,
            trackId,
            moduleId,
            slug: ex.slug,
            title: ex.title,
            difficulty: ex.difficulty,
            statement: ex.statement,
            starterCode: ex.starterCode,
            solutionCode: ex.solutionCode,
            tests: ex.tests,
            hints: ex.hints,
            tags: ex.tags,
            estimatedMinutes: ex.estimatedMinutes,
            externalUrl: ex.externalUrl ?? null,
            order: exerciseOrder,
          },
        });
        exerciseOrder += 1;
        exerciseTotal += 1;
      }
    }

    // External problems for this track (optional file)
    const problemsFile = path.join(PROBLEMS_DIR, `${track.slug}.json`);
    try {
      const raw = await readJson(problemsFile);
      const problemsParsed = problemsFileSchema.safeParse(raw);
      if (!problemsParsed.success) {
        console.error(`❌ ${problemsFile}`);
        console.error(problemsParsed.error.issues.map((i) => `   ${i.path.join(".")}: ${i.message}`).join("\n"));
        throw new Error(`Banco de problemas inválido: ${problemsFile}`);
      }
      for (const [index, p] of problemsParsed.data.entries()) {
        const problemId = id("p", p.slug);
        problemIds.add(problemId);
        await prisma.externalProblem.upsert({
          where: { id: problemId },
          update: {
            title: p.title,
            platform: p.platform,
            url: p.url,
            difficulty: p.difficulty,
            level: p.level,
            topic: p.topic,
            trackId,
            moduleSlug: p.moduleSlug ?? null,
            order: index,
            description: p.description ?? null,
          },
          create: {
            id: problemId,
            slug: p.slug,
            title: p.title,
            platform: p.platform,
            url: p.url,
            difficulty: p.difficulty,
            level: p.level,
            topic: p.topic,
            trackId,
            moduleSlug: p.moduleSlug ?? null,
            order: index,
            description: p.description ?? null,
          },
        });
        problemTotal += 1;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    lessonCounters.push({ counter: lessonOrder, total: lessonOrder });
    console.log(
      `   ✓ ${track.slug.padEnd(30)} ${String(track.modules.length).padStart(2)} módulos · ${String(lessonOrder).padStart(3)} aulas · ${String(exerciseOrder).padStart(2)} exercícios`
    );
  }

  // Projects
  try {
    const raw = await readJson(path.join(CONTENT_DIR, "projects.json"));
    const projects = projectsFileSchema.parse(raw);
    for (const [index, project] of projects.entries()) {
      const projectId = id("prj", project.slug);
      projectIds.add(projectId);
      await prisma.project.upsert({
        where: { id: projectId },
        update: {
          title: project.title,
          description: project.description,
          level: project.level,
          estimatedHours: project.estimatedHours,
          stack: project.stack,
          requirements: project.requirements,
          stretchGoals: project.stretchGoals,
          trackSlug: project.trackSlug ?? null,
          trackId: project.trackSlug ? trackIdBySlug.get(project.trackSlug) ?? null : null,
          order: index,
        },
        create: {
          id: projectId,
          slug: project.slug,
          title: project.title,
          description: project.description,
          level: project.level,
          estimatedHours: project.estimatedHours,
          stack: project.stack,
          requirements: project.requirements,
          stretchGoals: project.stretchGoals,
          trackSlug: project.trackSlug ?? null,
          trackId: project.trackSlug ? trackIdBySlug.get(project.trackSlug) ?? null : null,
          order: index,
        },
      });
    }
    console.log(`   ✓ projetos: ${projects.length}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("❌ content/projects.json");
      console.error((error as Error).message);
      throw error;
    }
  }

  console.log(
    `\n✅ Concluído: ${trackCount} trilhas · ${moduleCount} módulos · ${lessonTotal} aulas · ${exerciseTotal} exercícios · ${problemTotal} problemas externos.`
  );

  const [staleTracks, staleProblems, staleProjects] = await Promise.all([
    prisma.track.deleteMany({ where: { id: { notIn: [...trackIdBySlug.values()] } } }),
    prisma.externalProblem.deleteMany({ where: { id: { notIn: [...problemIds] } } }),
    prisma.project.deleteMany({ where: { id: { notIn: [...projectIds] } } }),
  ]);
  const removed = staleTracks.count + staleProblems.count + staleProjects.count;
  if (removed > 0) {
    console.log(
      `🧹 Poda: ${staleTracks.count} trilha(s), ${staleProblems.count} problema(s) e ${staleProjects.count} projeto(s) removidos.`
    );
  }
}

main()
  .catch((error) => {
    console.error("\n💥 Seed falhou:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
