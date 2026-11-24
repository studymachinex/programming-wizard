import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { addDays, pct, todayKey } from "@/lib/utils";

export const PROFILE_ID = "local";

export type GlobalStats = {
  lessonsTotal: number;
  lessonsDone: number;
  exercisesTotal: number;
  exercisesDone: number;
  problemsTotal: number;
  problemsDone: number;
  projectsTotal: number;
  projectsDone: number;
  minutes: number;
  todayMinutes: number;
  streak: number;
  reviewsDue: number;
  bookmarks: number;
};

export type ProfileView = {
  id: string;
  name: string;
  dailyGoalMinutes: number;
  targetRole: string;
};

export async function ensureProfile(): Promise<ProfileView> {
  return cached("pw:profile:v2", 600, async () => {
    const existing = await prisma.profile.findUnique({
      where: { id: PROFILE_ID },
      select: { id: true, name: true, dailyGoalMinutes: true, targetRole: true },
    });
    if (existing) return existing;
    return prisma.profile.upsert({
      where: { id: PROFILE_ID },
      update: {},
      create: { id: PROFILE_ID, name: "Mago" },
      select: { id: true, name: true, dailyGoalMinutes: true, targetRole: true },
    });
  });
}

export function calcStreak(days: string[]) {
  const set = new Set(days);
  let cursor = new Date();
  if (!set.has(todayKey(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (set.has(todayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

type StatsRow = {
  lessonsTotal: number;
  lessonsDone: number;
  exercisesTotal: number;
  exercisesDone: number;
  problemsTotal: number;
  problemsDone: number;
  projectsTotal: number;
  projectsDone: number;
  minutes: number;
  reviewsDue: number;
  bookmarks: number;
};

/**
 * Uma única ida ao banco (subselects) + sessões para streak/hoje.
 * Antes eram 12 queries sequenciais/paralelas por render.
 */
export async function getGlobalStats(): Promise<GlobalStats> {
  return cached("pw:stats:v2", 90, async () => {
    const now = new Date();
    const [rows, sessions] = await Promise.all([
      prisma.$queryRaw<StatsRow[]>`
        SELECT
          (SELECT COUNT(*) FROM "Lesson")::int AS "lessonsTotal",
          (SELECT COUNT(*) FROM "LessonProgress" WHERE "profileId" = ${PROFILE_ID} AND status = 'completed')::int AS "lessonsDone",
          (SELECT COUNT(*) FROM "Exercise")::int AS "exercisesTotal",
          (SELECT COUNT(*) FROM "ExerciseProgress" WHERE "profileId" = ${PROFILE_ID} AND status = 'solved')::int AS "exercisesDone",
          (SELECT COUNT(*) FROM "ExternalProblem")::int AS "problemsTotal",
          (SELECT COUNT(*) FROM "ProblemProgress" WHERE "profileId" = ${PROFILE_ID} AND status = 'solved')::int AS "problemsDone",
          (SELECT COUNT(*) FROM "Project")::int AS "projectsTotal",
          (SELECT COUNT(*) FROM "ProjectProgress" WHERE "profileId" = ${PROFILE_ID} AND status = 'done')::int AS "projectsDone",
          (SELECT COALESCE(SUM(minutes), 0) FROM "StudySession" WHERE "profileId" = ${PROFILE_ID})::int AS "minutes",
          (SELECT COUNT(*) FROM "ReviewItem" WHERE "profileId" = ${PROFILE_ID} AND "dueAt" <= ${now})::int AS "reviewsDue",
          (SELECT COUNT(*) FROM "LessonProgress" WHERE "profileId" = ${PROFILE_ID} AND bookmarked = true)::int AS "bookmarks"
      `,
      prisma.studySession.findMany({
        where: { profileId: PROFILE_ID, minutes: { gt: 0 } },
        select: { day: true, minutes: true },
        orderBy: { day: "desc" },
        take: 400,
      }),
    ]);

    const row = rows[0];
    const today = todayKey();
    return {
      lessonsTotal: row?.lessonsTotal ?? 0,
      lessonsDone: row?.lessonsDone ?? 0,
      exercisesTotal: row?.exercisesTotal ?? 0,
      exercisesDone: row?.exercisesDone ?? 0,
      problemsTotal: row?.problemsTotal ?? 0,
      problemsDone: row?.problemsDone ?? 0,
      projectsTotal: row?.projectsTotal ?? 0,
      projectsDone: row?.projectsDone ?? 0,
      minutes: row?.minutes ?? 0,
      todayMinutes: sessions.find((s) => s.day === today)?.minutes ?? 0,
      streak: calcStreak(sessions.map((s) => s.day)),
      reviewsDue: row?.reviewsDue ?? 0,
      bookmarks: row?.bookmarks ?? 0,
    };
  });
}

export type LessonRef = {
  id: string;
  title: string;
  slug: string;
  minutes: number;
  moduleSlug: string;
  moduleTitle: string;
  trackSlug: string;
  trackTitle: string;
  accent: string;
  status: string;
};

/**
 * Projeção enxuta: só o que os cards usam. Sem módulos/aulas/outcomes no payload
 * (antes o dashboard carregava ~300 KB de RSC só com dados não renderizados).
 */
export type TrackSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  level: string;
  icon: string;
  accent: string;
  estimatedHours: number;
  isCore: boolean;
  lessonCount: number;
  lessonsDone: number;
  exerciseCount: number;
  exercisesDone: number;
  problemCount: number;
  problemsDone: number;
  percent: number;
  nextLesson?: LessonRef;
  lastActivity?: string;
};

export async function getTrackSummaries(): Promise<TrackSummary[]> {
  return cached("pw:tracks:v2", 90, async () => {
    const [tracks, solvedExercises, solvedProblems] = await Promise.all([
      prisma.track.findMany({
        orderBy: { order: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          subtitle: true,
          description: true,
          level: true,
          icon: true,
          accent: true,
          estimatedHours: true,
          isCore: true,
          modules: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              slug: true,
              title: true,
              order: true,
              lessons: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  estimatedMinutes: true,
                  progress: {
                    where: { profileId: PROFILE_ID },
                    select: { status: true, updatedAt: true },
                  },
                },
              },
            },
          },
          _count: { select: { exercises: true, problems: true } },
        },
      }),
      prisma.exerciseProgress.findMany({
        where: { profileId: PROFILE_ID, status: "solved" },
        select: { exercise: { select: { trackId: true } } },
      }),
      prisma.problemProgress.findMany({
        where: { profileId: PROFILE_ID, status: "solved" },
        select: { problem: { select: { trackId: true } } },
      }),
    ]);

    const exByTrack = new Map<string, number>();
    for (const row of solvedExercises) {
      if (!row.exercise.trackId) continue;
      exByTrack.set(row.exercise.trackId, (exByTrack.get(row.exercise.trackId) ?? 0) + 1);
    }
    const prByTrack = new Map<string, number>();
    for (const row of solvedProblems) {
      if (!row.problem.trackId) continue;
      prByTrack.set(row.problem.trackId, (prByTrack.get(row.problem.trackId) ?? 0) + 1);
    }

    return tracks.map((track) => {
      let lessonCount = 0;
      let lessonsDone = 0;
      let nextLesson: LessonRef | undefined;
      let latest: Date | undefined;

      for (const mod of track.modules) {
        for (const lesson of mod.lessons) {
          const progress = lesson.progress[0];
          const status = progress?.status ?? "not_started";
          if (progress && (!latest || progress.updatedAt > latest)) latest = progress.updatedAt;
          lessonCount += 1;
          if (status === "completed") {
            lessonsDone += 1;
          } else if (!nextLesson || status === "in_progress") {
            if (!nextLesson || nextLesson.status !== "in_progress") {
              nextLesson = {
                id: lesson.id,
                title: lesson.title,
                slug: lesson.slug,
                minutes: lesson.estimatedMinutes,
                moduleSlug: mod.slug,
                moduleTitle: mod.title,
                trackSlug: track.slug,
                trackTitle: track.title,
                accent: track.accent,
                status,
              };
            }
          }
        }
      }

      return {
        id: track.id,
        slug: track.slug,
        title: track.title,
        subtitle: track.subtitle,
        description: track.description,
        level: track.level,
        icon: track.icon,
        accent: track.accent,
        estimatedHours: track.estimatedHours,
        isCore: track.isCore,
        lessonCount,
        lessonsDone,
        exerciseCount: track._count.exercises,
        exercisesDone: exByTrack.get(track.id) ?? 0,
        problemCount: track._count.problems,
        problemsDone: prByTrack.get(track.id) ?? 0,
        percent: pct(lessonsDone, lessonCount),
        nextLesson: lessonsDone === lessonCount ? undefined : nextLesson,
        lastActivity: latest?.toISOString(),
      };
    });
  });
}

export async function getContinueTarget(): Promise<LessonRef | null> {
  const tracks = await getTrackSummaries();
  const withProgress = tracks
    .filter((t) => t.lessonsDone > 0 && t.nextLesson)
    .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  return withProgress[0]?.nextLesson ?? tracks.find((t) => t.nextLesson)?.nextLesson ?? null;
}

export type HeatCell = { day: string; minutes: number; level: number };

export async function getHeatmap(weeks = 18): Promise<HeatCell[]> {
  return cached(`pw:heatmap:v2:${weeks}`, 60, async () => {
    const today = new Date();
    const start = addDays(today, -(weeks * 7 - 1));
    // alinha no domingo
    start.setDate(start.getDate() - start.getDay());
    const startKey = todayKey(start);

    const sessions = await prisma.studySession.findMany({
      where: { profileId: PROFILE_ID, minutes: { gt: 0 }, day: { gte: startKey } },
      select: { day: true, minutes: true },
      orderBy: { day: "asc" },
    });
    const byDay = new Map(sessions.map((s) => [s.day, s.minutes]));
    const cells: HeatCell[] = [];
    for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
      const key = todayKey(d);
      const minutes = byDay.get(key) ?? 0;
      const level = minutes === 0 ? 0 : minutes < 25 ? 1 : minutes < 55 ? 2 : minutes < 100 ? 3 : 4;
      cells.push({ day: key, minutes, level });
    }
    return cells;
  });
}

export async function getTodayPlan() {
  return cached("pw:today-plan:v2", 60, async () => {
    const target = await getContinueTarget();
    const trackSlug = target?.trackSlug;

    if (!trackSlug) {
      return { target, exercise: null, problem: null };
    }

    const [exercise, problem] = await Promise.all([
      prisma.exercise.findFirst({
        where: {
          track: { slug: trackSlug },
          progress: { none: { profileId: PROFILE_ID, status: "solved" } },
        },
        orderBy: { order: "asc" },
        select: { slug: true, title: true, difficulty: true, estimatedMinutes: true },
      }),
      prisma.externalProblem.findFirst({
        where: {
          track: { slug: trackSlug },
          progress: { none: { profileId: PROFILE_ID, status: "solved" } },
        },
        orderBy: [{ level: "asc" }, { order: "asc" }],
        select: { slug: true, title: true, platform: true, difficulty: true, url: true },
      }),
    ]);

    return {
      target,
      exercise: exercise
        ? { slug: exercise.slug, title: exercise.title, difficulty: exercise.difficulty, minutes: exercise.estimatedMinutes }
        : null,
      problem: problem
        ? { slug: problem.slug, title: problem.title, platform: problem.platform, difficulty: problem.difficulty, url: problem.url }
        : null,
    };
  });
}

export type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  href: string | null;
  detail: string | null;
  createdAt: string | Date;
};

export async function getRecentActivity(limit = 8): Promise<ActivityItem[]> {
  return cached(`pw:activity:v2:${limit}`, 45, async () => {
    return prisma.activityLog.findMany({
      where: { profileId: PROFILE_ID },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, kind: true, title: true, href: true, detail: true, createdAt: true },
    });
  });
}

export type ReviewItemView = {
  id: string;
  kind: string;
  title: string;
  href: string;
  dueAt: string | Date;
  intervalDays: number;
};

export async function getReviewQueue() {
  return cached("pw:review-queue:v2", 45, async () => {
    const now = new Date();
    const [due, upcoming] = await Promise.all([
      prisma.reviewItem.findMany({
        where: { profileId: PROFILE_ID, dueAt: { lte: now } },
        orderBy: { dueAt: "asc" },
        take: 40,
        select: { id: true, kind: true, title: true, href: true, dueAt: true, intervalDays: true, repetitions: true },
      }),
      prisma.reviewItem.findMany({
        where: { profileId: PROFILE_ID, dueAt: { gt: now } },
        orderBy: { dueAt: "asc" },
        take: 12,
        select: { id: true, kind: true, title: true, href: true, dueAt: true, intervalDays: true, repetitions: true },
      }),
    ]);
    return { due, upcoming };
  });
}

export async function getDashboardData() {
  const [profile, stats, tracks, heatmap, plan, activity, reviews] = await Promise.all([
    ensureProfile(),
    getGlobalStats(),
    getTrackSummaries(),
    getHeatmap(18),
    getTodayPlan(),
    getRecentActivity(7),
    getReviewQueue(),
  ]);
  return { profile, stats, tracks, heatmap, plan, activity, reviews };
}

/**
 * Ementa usada pela sidebar da aula e pela navegação prev/next.
 * Cacheada por trilha: navegar entre aulas não repete a consulta.
 */
export async function getTrackOutline(trackSlug: string) {
  return cached(`pw:outline:v2:${trackSlug}`, 300, async () => {
    return prisma.track.findUnique({
      where: { slug: trackSlug },
      select: {
        id: true,
        slug: true,
        title: true,
        accent: true,
        icon: true,
        modules: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            slug: true,
            title: true,
            order: true,
            lessons: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                slug: true,
                title: true,
                estimatedMinutes: true,
                progress: {
                  where: { profileId: PROFILE_ID },
                  select: { status: true },
                },
              },
            },
          },
        },
      },
    });
  });
}

/** Conteúdo + estado da aula em uma única consulta, cacheado. */
export async function getLessonDetail(trackSlug: string, lessonSlug: string) {
  return cached(`pw:lesson:v2:${trackSlug}:${lessonSlug}`, 300, async () => {
    return prisma.lesson.findFirst({
      where: { slug: lessonSlug, track: { slug: trackSlug } },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        estimatedMinutes: true,
        content: true,
        takeaways: true,
        quiz: true,
        module: { select: { id: true, slug: true, title: true, order: true } },
        progress: {
          where: { profileId: PROFILE_ID },
          select: { status: true, bookmarked: true, notes: true },
        },
        activities: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            kind: true,
            title: true,
            statement: true,
            starterCode: true,
            solutionCode: true,
            hints: true,
            progress: {
              where: { profileId: PROFILE_ID },
              select: { code: true, status: true, attempts: true },
            },
          },
        },
      },
    });
  });
}

export async function getTrackPageData(slug: string) {
  return cached(`pw:track-page:v2:${slug}`, 300, async () => {
    return prisma.track.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        level: true,
        icon: true,
        accent: true,
        estimatedHours: true,
        isCore: true,
        outcomes: true,
        modules: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            order: true,
            lessons: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                slug: true,
                title: true,
                summary: true,
                estimatedMinutes: true,
                progress: {
                  where: { profileId: PROFILE_ID },
                  select: { status: true, bookmarked: true },
                },
              },
            },
            exercises: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                slug: true,
                title: true,
                difficulty: true,
                estimatedMinutes: true,
                progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
              },
            },
          },
        },
        problems: {
          orderBy: [{ level: "asc" }, { order: "asc" }],
          select: {
            id: true,
            slug: true,
            title: true,
            platform: true,
            url: true,
            difficulty: true,
            level: true,
            topic: true,
            progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
          },
        },
      },
    });
  });
}

/**
 * Catálogos: seleção explícita de campos. Antes o `include` trazia
 * statement/solution/tests/description inteiros para listas que não os usam.
 */
export async function getExerciseCatalog() {
  return cached("pw:catalog:exercises:v2", 120, async () => {
    return prisma.exercise.findMany({
      orderBy: [{ trackId: "asc" }, { order: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        difficulty: true,
        tags: true,
        estimatedMinutes: true,
        order: true,
        trackId: true,
        track: { select: { title: true, slug: true, accent: true, icon: true } },
        progress: { where: { profileId: PROFILE_ID }, select: { status: true, attempts: true } },
      },
    });
  });
}

export async function getProblemCatalog() {
  return cached("pw:catalog:problems:v2", 120, async () => {
    return prisma.externalProblem.findMany({
      orderBy: [{ level: "asc" }, { order: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        platform: true,
        url: true,
        difficulty: true,
        level: true,
        topic: true,
        track: { select: { title: true, slug: true, accent: true, icon: true } },
        progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
      },
    });
  });
}

export async function getProjectCatalog() {
  return cached("pw:catalog:projects:v2", 120, async () => {
    return prisma.project.findMany({
      orderBy: [{ order: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        level: true,
        estimatedHours: true,
        stack: true,
        requirements: true,
        progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
      },
    });
  });
}

/** Diretório enxuto de trilhas para filtros de listas. */
export async function getTrackDirectory() {
  return cached("pw:track-directory:v2", 300, async () => {
    return prisma.track.findMany({
      orderBy: { order: "asc" },
      select: { id: true, slug: true, title: true, accent: true, icon: true },
    });
  });
}

/** Detalhe do exercício + relacionados, em uma consulta cacheada por slug. */
export async function getExerciseDetail(slug: string) {
  return cached(`pw:exercise:v2:${slug}`, 300, async () => {
    const exercise = await prisma.exercise.findUnique({
      where: { slug },
      include: {
        track: { select: { title: true, slug: true, accent: true, icon: true } },
        module: { select: { title: true, slug: true } },
        progress: { where: { profileId: PROFILE_ID } },
      },
    });
    if (!exercise) return null;

    const related = await prisma.exercise.findMany({
      where: { trackId: exercise.trackId, id: { not: exercise.id } },
      orderBy: { order: "asc" },
      take: 4,
      select: {
        id: true,
        slug: true,
        title: true,
        difficulty: true,
        progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
      },
    });

    return { exercise, related };
  });
}

/** Detalhe do capstone, cacheado entre a metadata e o render. */
export async function getProjectDetail(slug: string) {
  return cached(`pw:project:v2:${slug}`, 300, async () => {
    return prisma.project.findUnique({
      where: { slug },
      include: {
        track: { select: { slug: true, title: true } },
        progress: { where: { profileId: PROFILE_ID } },
      },
    });
  });
}
