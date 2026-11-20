import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/redis";
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

export async function ensureProfile() {
  return prisma.profile.upsert({
    where: { id: PROFILE_ID },
    update: {},
    create: { id: PROFILE_ID, name: "Mago" },
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

export async function getGlobalStats(): Promise<GlobalStats> {
  const cached = await cacheGet<GlobalStats>("pw:stats:v1");
  if (cached) return cached;

  const [lessonsTotal, lessonsDone, exercisesTotal, exercisesDone, projectsTotal, projectsDone, sessions, totalAgg, reviewsDue, bookmarks] =
    await Promise.all([
      prisma.lesson.count(),
      prisma.lessonProgress.count({ where: { profileId: PROFILE_ID, status: "completed" } }),
      prisma.exercise.count(),
      prisma.exerciseProgress.count({ where: { profileId: PROFILE_ID, status: "solved" } }),
      prisma.project.count(),
      prisma.projectProgress.count({ where: { profileId: PROFILE_ID, status: "done" } }),
      prisma.studySession.findMany({
        where: { profileId: PROFILE_ID, minutes: { gt: 0 } },
        select: { day: true, minutes: true },
        orderBy: { day: "desc" },
        take: 400,
      }),
      prisma.studySession.aggregate({ where: { profileId: PROFILE_ID }, _sum: { minutes: true } }),
      prisma.reviewItem.count({ where: { profileId: PROFILE_ID, dueAt: { lte: new Date() } } }),
      prisma.lessonProgress.count({ where: { profileId: PROFILE_ID, bookmarked: true } }),
    ]);

  const today = todayKey();
  const stats: GlobalStats = {
    lessonsTotal,
    lessonsDone,
    exercisesTotal,
    exercisesDone,
    projectsTotal,
    projectsDone,
    problemsTotal: await prisma.externalProblem.count(),
    problemsDone: await prisma.problemProgress.count({ where: { profileId: PROFILE_ID, status: "solved" } }),
    minutes: totalAgg._sum.minutes ?? 0,
    todayMinutes: sessions.find((s) => s.day === today)?.minutes ?? 0,
    streak: calcStreak(sessions.map((s) => s.day)),
    reviewsDue,
    bookmarks,
  };
  await cacheSet("pw:stats:v1", stats, 45);
  return stats;
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
  outcomes: string[];
  modules: {
    id: string;
    slug: string;
    title: string;
    order: number;
    lessonCount: number;
    lessonsDone: number;
    lessons: {
      id: string;
      slug: string;
      title: string;
      minutes: number;
      summary: string;
      status: string;
      bookmarked: boolean;
    }[];
  }[];
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
  const cached = await cacheGet<TrackSummary[]>("pw:tracks:v1");
  if (cached) return cached;

  const [tracks, solvedExercises, solvedProblems, recent] = await Promise.all([
    prisma.track.findMany({
      orderBy: { order: "asc" },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: {
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
                  select: { status: true, bookmarked: true, updatedAt: true },
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
    prisma.lessonProgress.findMany({
      where: { profileId: PROFILE_ID },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { lessonId: true, updatedAt: true },
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
  const recentByLesson = new Map(recent.map((r) => [r.lessonId, r.updatedAt]));

  return tracks.map((track) => {
    let lessonCount = 0;
    let lessonsDone = 0;
    let nextLesson: LessonRef | undefined;
    let latest: Date | undefined;

    const modules = track.modules.map((mod) => {
      let modDone = 0;
      for (const lesson of mod.lessons) {
        const status = lesson.progress[0]?.status ?? "not_started";
        const updated = recentByLesson.get(lesson.id);
        if (updated && (!latest || updated > latest)) latest = updated;
        lessonCount += 1;
        if (status === "completed") {
          modDone += 1;
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
      return {
        id: mod.id,
        slug: mod.slug,
        title: mod.title,
        order: mod.order,
        lessonCount: mod.lessons.length,
        lessonsDone: modDone,
        lessons: mod.lessons.map((l) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          minutes: l.estimatedMinutes,
          summary: l.summary,
          status: l.progress[0]?.status ?? "not_started",
          bookmarked: l.progress[0]?.bookmarked ?? false,
        })),
      };
    });

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
      outcomes: track.outcomes,
      modules,
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
}

export async function getContinueTarget() {
  const tracks = await getTrackSummaries();
  const withProgress = tracks
    .filter((t) => t.lessonsDone > 0 && t.nextLesson)
    .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  return withProgress[0]?.nextLesson ?? tracks.find((t) => t.nextLesson)?.nextLesson ?? null;
}

export type HeatCell = { day: string; minutes: number; level: number };

export async function getHeatmap(weeks = 18): Promise<HeatCell[]> {
  const sessions = await prisma.studySession.findMany({
    where: { profileId: PROFILE_ID, minutes: { gt: 0 } },
    select: { day: true, minutes: true },
    orderBy: { day: "asc" },
  });
  const byDay = new Map(sessions.map((s) => [s.day, s.minutes]));
  const cells: HeatCell[] = [];
  const today = new Date();
  const start = addDays(today, -(weeks * 7 - 1));
  // align to Sunday
  start.setDate(start.getDate() - start.getDay());
  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    const key = todayKey(d);
    const minutes = byDay.get(key) ?? 0;
    const level = minutes === 0 ? 0 : minutes < 25 ? 1 : minutes < 55 ? 2 : minutes < 100 ? 3 : 4;
    cells.push({ day: key, minutes, level });
  }
  return cells;
}

export async function getTodayPlan() {
  const target = await getContinueTarget();
  const trackSlug = target?.trackSlug;
  let exercise: { slug: string; title: string; difficulty: string; minutes: number } | null = null;
  let problem: { slug: string; title: string; platform: string; difficulty: string; url: string } | null = null;

  if (trackSlug) {
    const track = await prisma.track.findUnique({
      where: { slug: trackSlug },
      select: {
        exercises: {
          orderBy: { order: "asc" },
          select: {
            slug: true,
            title: true,
            difficulty: true,
            estimatedMinutes: true,
            progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
          },
        },
        problems: {
          orderBy: { level: "asc" },
          select: {
            slug: true,
            title: true,
            platform: true,
            difficulty: true,
            url: true,
            progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
          },
        },
      },
    });
    const ex = track?.exercises.find((e) => (e.progress[0]?.status ?? "todo") !== "solved");
    if (ex) exercise = { slug: ex.slug, title: ex.title, difficulty: ex.difficulty, minutes: ex.estimatedMinutes };
    const pr = track?.problems.find((p) => (p.progress[0]?.status ?? "todo") !== "solved");
    if (pr) problem = { slug: pr.slug, title: pr.title, platform: pr.platform, difficulty: pr.difficulty, url: pr.url };
  }

  return { target, exercise, problem };
}

export async function getRecentActivity(limit = 8) {
  return prisma.activityLog.findMany({
    where: { profileId: PROFILE_ID },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getReviewQueue() {
  const now = new Date();
  const [due, upcoming] = await Promise.all([
    prisma.reviewItem.findMany({
      where: { profileId: PROFILE_ID, dueAt: { lte: now } },
      orderBy: { dueAt: "asc" },
      take: 40,
    }),
    prisma.reviewItem.findMany({
      where: { profileId: PROFILE_ID, dueAt: { gt: now } },
      orderBy: { dueAt: "asc" },
      take: 12,
    }),
  ]);
  return { due, upcoming };
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
