import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "codecrafters");
const WORKSPACES_DIR = path.join(ROOT, "challenges", ".workspaces");
const STATE_DIR = path.join(WORKSPACES_DIR, ".state");

export type CatalogStage = {
  order: number;
  id: string;
  title: string;
  difficulty: string;
  section: string;
  url: string;
};

export type CatalogChallenge = {
  slug: string;
  title: string;
  description: string;
  access: string;
  catalogUrl: string;
  stageCount: number;
  stages: CatalogStage[];
};

export type Catalog = {
  source: string;
  syncedAt: string;
  challenges: CatalogChallenge[];
};

export type CourseStage = CatalogStage & {
  slug: string;
  summary: string;
  file: string;
};

export type Course = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  language: string;
  languageLabel: string;
  estimatedHours: number;
  topics: string[];
  prerequisites: string[];
  runtime: {
    starter: string;
    reference: string;
    runner: string;
    compile: { command: string; args: string[]; timeoutMs: number };
    port?: number;
    runCommand: string;
  };
  stages: CourseStage[];
};

export type StageResult = {
  number: number;
  title: string;
  ok: boolean;
  error?: string;
  durationMs: number;
};

export type ChallengeRun = {
  kind: "submit" | "test";
  at: string;
  commit?: string | null;
  durationMs: number;
  compileFailed?: boolean;
  attemptedStage?: number;
  advanced?: boolean;
  passed: number[];
  failed: number[];
  results: StageResult[];
  output: string;
};

export type ChallengeState = {
  challenge: string;
  language: string;
  completed: number[];
  currentStage: number;
  attempts: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastRun: ChallengeRun | null;
  lastTest: ChallengeRun | null;
  history: Array<{
    kind: string;
    commit?: string | null;
    at: string;
    durationMs: number;
    passed: number[];
    failed: number[];
  }>;
};

export type ChallengeCard = {
  slug: string;
  title: string;
  description: string;
  stageCount: number;
  completed: number;
  status: "done" | "in_progress" | "available" | "planned";
  available: boolean;
  href: string;
  language: string | null;
  tags: string[];
};

export type WorkspaceInfo = {
  exists: boolean;
  directory: string | null;
  relativeDirectory: string | null;
  mainFile: string | null;
  stateFile: string;
};

const DEFAULT_STATE = (slug: string): ChallengeState => ({
  challenge: slug,
  language: "java",
  completed: [],
  currentStage: 1,
  attempts: 0,
  createdAt: null,
  updatedAt: null,
  lastRun: null,
  lastTest: null,
  history: [],
});

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

let catalogCache: { at: number; value: Catalog } | null = null;

export function getCatalog(): Catalog {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < 30_000) return catalogCache.value;
  const value =
    readJson<Catalog>(path.join(CONTENT_DIR, "catalog.json")) ?? {
      source: "https://app.codecrafters.io/catalog",
      syncedAt: new Date(0).toISOString(),
      challenges: [],
    };
  catalogCache = { at: now, value };
  return value;
}

export function getChallengeMeta(slug: string): CatalogChallenge | null {
  return getCatalog().challenges.find((challenge) => challenge.slug === slug) ?? null;
}

export function getCourse(slug: string): Course | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return readJson<Course>(path.join(CONTENT_DIR, slug, "course.json"));
}

export function getStageInstructions(slug: string, course: Course, stage: CourseStage): string {
  try {
    return fs.readFileSync(path.join(CONTENT_DIR, slug, stage.file), "utf8");
  } catch {
    return "Instruções ainda não disponíveis.";
  }
}

export function getChallengeState(slug: string): ChallengeState {
  const parsed = readJson<Partial<ChallengeState>>(path.join(STATE_DIR, `${slug}.json`));
  if (!parsed) return DEFAULT_STATE(slug);
  return {
    ...DEFAULT_STATE(slug),
    ...parsed,
    completed: Array.isArray(parsed.completed) ? parsed.completed : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
  };
}

export function getWorkspaceInfo(slug: string, course: Course | null): WorkspaceInfo {
  const language = course?.language ?? "java";
  const directory = path.join(WORKSPACES_DIR, `${slug}-${language}`);
  const exists = fs.existsSync(directory);
  return {
    exists,
    directory: exists ? directory : null,
    relativeDirectory: exists ? path.relative(ROOT, directory).split(path.sep).join("/") : null,
    mainFile:
      course?.language === "java" ? path.join(directory, "src", "main", "java", "Main.java") : null,
    stateFile: path.relative(ROOT, path.join(STATE_DIR, `${slug}.json`)).split(path.sep).join("/"),
  };
}

export function getSelectedStage(
  course: Course,
  state: ChallengeState,
  query?: string | string[]
): CourseStage {
  const value = Array.isArray(query) ? query[0] : query;
  if (value) {
    const numeric = Number(value);
    const found =
      course.stages.find((stage) => stage.order === numeric) ??
      course.stages.find((stage) => stage.id === value) ??
      course.stages.find((stage) => stage.slug === value);
    if (found) return found;
  }
  return (
    course.stages.find((stage) => stage.order === state.currentStage) ??
    course.stages[course.stages.length - 1] ??
    course.stages[0]
  );
}

export function getChallengeCards(): ChallengeCard[] {
  const catalog = getCatalog();
  return catalog.challenges.map((challenge) => {
    const course = getCourse(challenge.slug);
    const state = getChallengeState(challenge.slug);
    const total = course?.stages.length ?? challenge.stageCount;
    const completed = state.completed.length;
    const status: ChallengeCard["status"] = !course
      ? "planned"
      : completed >= total && total > 0
        ? "done"
        : completed > 0
          ? "in_progress"
          : "available";
    return {
      slug: challenge.slug,
      title: challenge.title,
      description: challenge.description,
      stageCount: total,
      completed,
      status,
      available: Boolean(course),
      href: `/projetos/codecrafters/${challenge.slug}`,
      language: course?.languageLabel ?? null,
      tags: course?.topics.slice(0, 4) ?? [],
    };
  });
}

export type CodecraftersOverview = {
  totalChallenges: number;
  totalStages: number;
  completedStages: number;
  completedChallenges: number;
  inProgress: number;
  available: number;
  cards: ChallengeCard[];
};

let overviewCache: { at: number; value: CodecraftersOverview } | null = null;

export function getCodecraftersOverview(): CodecraftersOverview {
  const now = Date.now();
  if (overviewCache && now - overviewCache.at < 30_000) return overviewCache.value;

  const catalog = getCatalog();
  const cards = getChallengeCards();
  const priority: Record<ChallengeCard["status"], number> = {
    in_progress: 0,
    available: 1,
    done: 2,
    planned: 3,
  };
  cards.sort((a, b) => priority[a.status] - priority[b.status]);
  const totalStages = catalog.challenges.reduce((sum, challenge) => sum + challenge.stageCount, 0);
  const completedStages = cards.reduce((sum, card) => sum + card.completed, 0);
  const completedChallenges = cards.filter((card) => card.status === "done").length;
  const inProgress = cards.filter((card) => card.status === "in_progress").length;
  const available = cards.filter((card) => card.available).length;

  const value = {
    totalChallenges: catalog.challenges.length,
    totalStages,
    completedStages,
    completedChallenges,
    inProgress,
    available,
    cards,
  };
  overviewCache = { at: now, value };
  return value;
}

export function progressPercent(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function statusLabel(status: ChallengeCard["status"]) {
  return {
    done: "concluído",
    in_progress: "em andamento",
    available: "disponível",
    planned: "em breve",
  }[status];
}
