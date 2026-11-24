"use server";

import { prisma } from "@/lib/prisma";
import { cacheDel, cacheDelPrefix } from "@/lib/redis";
import { PROFILE_ID } from "@/lib/data";
import { addDays, todayKey } from "@/lib/utils";
import { revalidatePath } from "next/cache";

type RefreshScope = {
  trackSlug?: string;
  lessonSlug?: string;
  exerciseSlug?: string;
  projectSlug?: string;
  profile?: boolean;
  everything?: boolean;
};

/**
 * Invalida só o que mudou. Antes cada ação apagava todas as chaves `pw:*`
 * e re-renderizava a árvore inteira; agora o cache quente sobrevive.
 */
async function refresh(scope: RefreshScope = {}) {
  if (scope.everything) {
    await cacheDelPrefix("pw:");
  } else {
    const keys = [
      "pw:stats:v2",
      "pw:tracks:v2",
      "pw:today-plan:v2",
      "pw:review-queue:v2",
      "pw:track-directory:v2",
      "pw:catalog:exercises:v2",
      "pw:catalog:problems:v2",
      "pw:catalog:projects:v2",
    ];
    if (scope.profile) keys.push("pw:profile:v2");
    if (scope.trackSlug) keys.push(`pw:track-page:v2:${scope.trackSlug}`, `pw:outline:v2:${scope.trackSlug}`);
    if (scope.trackSlug && scope.lessonSlug) keys.push(`pw:lesson:v2:${scope.trackSlug}:${scope.lessonSlug}`);
    if (scope.exerciseSlug) keys.push(`pw:exercise:v2:${scope.exerciseSlug}`);
    if (scope.projectSlug) keys.push(`pw:project:v2:${scope.projectSlug}`);

    await Promise.all([
      cacheDel(...keys),
      cacheDelPrefix("pw:heatmap:v2:"),
      cacheDelPrefix("pw:activity:v2:"),
    ]);
  }
  revalidatePath("/", "layout");
}

async function bumpSession(data: {
  minutes?: number;
  lessons?: number;
  exercises?: number;
  problems?: number;
}) {
  const day = todayKey();
  await prisma.studySession.upsert({
    where: { profileId_day: { profileId: PROFILE_ID, day } },
    update: {
      minutes: { increment: data.minutes ?? 0 },
      lessonsDone: { increment: data.lessons ?? 0 },
      exercisesDone: { increment: data.exercises ?? 0 },
      problemsDone: { increment: data.problems ?? 0 },
    },
    create: {
      profileId: PROFILE_ID,
      day,
      minutes: data.minutes ?? 0,
      lessonsDone: data.lessons ?? 0,
      exercisesDone: data.exercises ?? 0,
      problemsDone: data.problems ?? 0,
    },
  });
}

async function log(kind: string, title: string, href?: string, detail?: string) {
  await prisma.activityLog.create({
    data: { profileId: PROFILE_ID, kind, title, href, detail },
  });
}

async function scheduleReview(kind: string, refId: string, title: string, href: string) {
  await prisma.reviewItem.upsert({
    where: { profileId_kind_refId: { profileId: PROFILE_ID, kind, refId } },
    update: {},
    create: {
      profileId: PROFILE_ID,
      kind,
      refId,
      title,
      href,
      dueAt: addDays(new Date(), 1),
    },
  });
}

export async function setLessonCompletion(lessonId: string, completed: boolean) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { track: true } } },
  });
  if (!lesson) return { ok: false, error: "Aula não encontrada" };

  const existing = await prisma.lessonProgress.findUnique({
    where: { profileId_lessonId: { profileId: PROFILE_ID, lessonId } },
  });
  const wasCompleted = existing?.status === "completed";

  await prisma.lessonProgress.upsert({
    where: { profileId_lessonId: { profileId: PROFILE_ID, lessonId } },
    update: {
      status: completed ? "completed" : "in_progress",
      completedAt: completed ? existing?.completedAt ?? new Date() : null,
    },
    create: {
      profileId: PROFILE_ID,
      lessonId,
      status: completed ? "completed" : "in_progress",
      completedAt: completed ? new Date() : null,
    },
  });

  if (completed && !wasCompleted) {
    await bumpSession({ minutes: lesson.estimatedMinutes, lessons: 1 });
    await log(
      "lesson",
      lesson.title,
      `/trilhas/${lesson.module.track.slug}/aulas/${lesson.slug}`,
      lesson.module.track.title
    );
    await scheduleReview(
      "lesson",
      lessonId,
      lesson.title,
      `/trilhas/${lesson.module.track.slug}/aulas/${lesson.slug}`
    );
  }
  await refresh({ trackSlug: lesson.module.track.slug, lessonSlug: lesson.slug });
  return { ok: true };
}

export async function toggleLessonBookmark(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { slug: true, module: { select: { track: { select: { slug: true } } } } },
  });
  if (!lesson) return { ok: false };

  const existing = await prisma.lessonProgress.findUnique({
    where: { profileId_lessonId: { profileId: PROFILE_ID, lessonId } },
  });
  const next = !(existing?.bookmarked ?? false);
  await prisma.lessonProgress.upsert({
    where: { profileId_lessonId: { profileId: PROFILE_ID, lessonId } },
    update: { bookmarked: next },
    create: { profileId: PROFILE_ID, lessonId, bookmarked: next },
  });
  await refresh({ trackSlug: lesson.module.track.slug, lessonSlug: lesson.slug });
  return { ok: true, bookmarked: next };
}

export async function saveLessonNotes(lessonId: string, notes: string) {
  await prisma.lessonProgress.upsert({
    where: { profileId_lessonId: { profileId: PROFILE_ID, lessonId } },
    update: { notes: notes.slice(0, 20000) },
    create: { profileId: PROFILE_ID, lessonId, notes: notes.slice(0, 20000) },
  });
  // Só o cache da aula muda; não revalida a árvore inteira a cada tecla.
  await cacheDelPrefix("pw:lesson:v2:");
  return { ok: true };
}

export async function saveExerciseCode(exerciseId: string, code: string) {
  const existing = await prisma.exerciseProgress.findUnique({
    where: { profileId_exerciseId: { profileId: PROFILE_ID, exerciseId } },
  });
  await prisma.exerciseProgress.upsert({
    where: { profileId_exerciseId: { profileId: PROFILE_ID, exerciseId } },
    update: {
      code: code.slice(0, 60000),
      attempts: { increment: 1 },
      status: existing?.status === "solved" ? "solved" : "attempted",
    },
    create: {
      profileId: PROFILE_ID,
      exerciseId,
      code: code.slice(0, 60000),
      attempts: 1,
      status: "attempted",
    },
  });
  await cacheDelPrefix("pw:exercise:v2:");
  return { ok: true };
}

export async function setExerciseSolved(exerciseId: string, solved: boolean) {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { track: true },
  });
  if (!exercise) return { ok: false, error: "Exercício não encontrado" };
  const existing = await prisma.exerciseProgress.findUnique({
    where: { profileId_exerciseId: { profileId: PROFILE_ID, exerciseId } },
  });
  const wasSolved = existing?.status === "solved";

  await prisma.exerciseProgress.upsert({
    where: { profileId_exerciseId: { profileId: PROFILE_ID, exerciseId } },
    update: {
      status: solved ? "solved" : "attempted",
      completedAt: solved ? existing?.completedAt ?? new Date() : null,
    },
    create: {
      profileId: PROFILE_ID,
      exerciseId,
      status: solved ? "solved" : "attempted",
      completedAt: solved ? new Date() : null,
    },
  });

  if (solved && !wasSolved) {
    await bumpSession({ minutes: exercise.estimatedMinutes, exercises: 1 });
    await log("exercise", exercise.title, `/exercicios/${exercise.slug}`, exercise.track.title);
    await scheduleReview("exercise", exerciseId, exercise.title, `/exercicios/${exercise.slug}`);
  }
  await refresh({ trackSlug: exercise.track.slug, exerciseSlug: exercise.slug });
  return { ok: true };
}

/** Atividade de aula concluída (código aprovado pelos testes ou reflexão marcada). */
export async function setActivityDone(activityId: string, done: boolean) {
  const activity = await prisma.lessonActivity.findUnique({
    where: { id: activityId },
    include: { lesson: { include: { track: true } } },
  });
  if (!activity) return { ok: false, error: "Atividade não encontrada" };
  const existing = await prisma.activityProgress.findUnique({
    where: { profileId_activityId: { profileId: PROFILE_ID, activityId } },
  });
  const wasDone = existing?.status === "done";
  await prisma.activityProgress.upsert({
    where: { profileId_activityId: { profileId: PROFILE_ID, activityId } },
    update: { status: done ? "done" : "todo", completedAt: done ? existing?.completedAt ?? new Date() : null },
    create: { profileId: PROFILE_ID, activityId, status: done ? "done" : "todo", completedAt: done ? new Date() : null },
  });
  if (done && !wasDone && activity.kind === "code") {
    const href = `/trilhas/${activity.lesson.track.slug}/aulas/${activity.lesson.slug}#atividades`;
    await bumpSession({ minutes: 10, exercises: 1 });
    await log("activity", activity.title, href, activity.lesson.title);
  }
  await refresh({ trackSlug: activity.lesson.track.slug, lessonSlug: activity.lesson.slug });
  return { ok: true };
}

/** Guarda o rascunho de uma atividade de código (sem rodar os testes). */
export async function saveActivityCode(activityId: string, code: string) {
  const existing = await prisma.activityProgress.findUnique({
    where: { profileId_activityId: { profileId: PROFILE_ID, activityId } },
  });
  await prisma.activityProgress.upsert({
    where: { profileId_activityId: { profileId: PROFILE_ID, activityId } },
    update: { code: code.slice(0, 60000), status: existing?.status === "done" ? "done" : "attempted" },
    create: { profileId: PROFILE_ID, activityId, code: code.slice(0, 60000), status: "attempted" },
  });
  await cacheDelPrefix("pw:lesson:v2:");
  return { ok: true };
}

export async function setProblemSolved(problemId: string, solved: boolean) {
  const problem = await prisma.externalProblem.findUnique({
    where: { id: problemId },
    include: { track: { select: { slug: true } } },
  });
  if (!problem) return { ok: false, error: "Problema não encontrado" };
  const existing = await prisma.problemProgress.findUnique({
    where: { profileId_problemId: { profileId: PROFILE_ID, problemId } },
  });
  const wasSolved = existing?.status === "solved";

  await prisma.problemProgress.upsert({
    where: { profileId_problemId: { profileId: PROFILE_ID, problemId } },
    update: {
      status: solved ? "solved" : "todo",
      completedAt: solved ? existing?.completedAt ?? new Date() : null,
    },
    create: {
      profileId: PROFILE_ID,
      problemId,
      status: solved ? "solved" : "todo",
      completedAt: solved ? new Date() : null,
    },
  });

  if (solved && !wasSolved) {
    await bumpSession({ minutes: 25, problems: 1 });
    await log("problem", problem.title, problem.url, problem.platform);
    await scheduleReview("problem", problemId, problem.title, `/desafios?q=${encodeURIComponent(problem.title)}`);
  }
  await refresh({ trackSlug: problem.track?.slug });
  return { ok: true };
}

export async function saveProjectProgress(input: {
  projectId: string;
  status: string;
  repoUrl: string;
  notes: string;
}) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) return { ok: false, error: "Projeto não encontrado" };
  const existing = await prisma.projectProgress.findUnique({
    where: { profileId_projectId: { profileId: PROFILE_ID, projectId: input.projectId } },
  });
  const wasDone = existing?.status === "done";
  const isDone = input.status === "done";

  await prisma.projectProgress.upsert({
    where: { profileId_projectId: { profileId: PROFILE_ID, projectId: input.projectId } },
    update: {
      status: input.status,
      repoUrl: input.repoUrl.slice(0, 500),
      notes: input.notes.slice(0, 20000),
      completedAt: isDone ? existing?.completedAt ?? new Date() : null,
    },
    create: {
      profileId: PROFILE_ID,
      projectId: input.projectId,
      status: input.status,
      repoUrl: input.repoUrl.slice(0, 500),
      notes: input.notes.slice(0, 20000),
      completedAt: isDone ? new Date() : null,
    },
  });

  if (isDone && !wasDone) {
    await bumpSession({ minutes: 45 });
    await log("project", project.title, `/projetos/${project.slug}`, "Projeto concluído");
  }
  await refresh({ projectSlug: project.slug });
  return { ok: true };
}

export async function submitReview(itemId: string, quality: 0 | 1 | 2 | 3) {
  const item = await prisma.reviewItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false };
  const now = new Date();

  let interval = item.intervalDays;
  let ease = item.ease;
  let repetitions = item.repetitions;

  if (quality === 0) {
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    repetitions = 0;
  } else {
    repetitions += 1;
    if (quality === 1) {
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.max(1, Math.round(interval * 1.2));
    } else if (quality === 2) {
      interval = repetitions <= 2 ? 3 : Math.max(3, Math.round(interval * ease));
    } else {
      ease = Math.min(3.0, ease + 0.15);
      interval = Math.max(4, Math.round(interval * ease * 1.3));
    }
  }

  await prisma.reviewItem.update({
    where: { id: itemId },
    data: {
      intervalDays: interval,
      ease,
      repetitions,
      lastReviewedAt: now,
      dueAt: addDays(now, interval),
    },
  });
  await prisma.activityLog.create({
    data: {
      profileId: PROFILE_ID,
      kind: "review",
      title: item.title,
      href: item.href,
      detail: quality === 0 ? "Revisão: errei" : "Revisão concluída",
    },
  });
  await refresh();
  return { ok: true, nextDue: addDays(now, interval).toISOString() };
}

export async function updateProfile(input: { name: string; dailyGoalMinutes: number; targetRole: string }) {
  await prisma.profile.upsert({
    where: { id: PROFILE_ID },
    update: {
      name: input.name.trim().slice(0, 60) || "Mago",
      dailyGoalMinutes: Math.min(480, Math.max(10, Math.round(input.dailyGoalMinutes))),
      targetRole: input.targetRole.trim().slice(0, 120) || "Senior Software Engineer",
    },
    create: {
      id: PROFILE_ID,
      name: input.name.trim().slice(0, 60) || "Mago",
      dailyGoalMinutes: Math.min(480, Math.max(10, Math.round(input.dailyGoalMinutes))),
      targetRole: input.targetRole.trim().slice(0, 120) || "Senior Software Engineer",
    },
  });
  await refresh({ profile: true });
  return { ok: true };
}

export async function logStudyTime(minutes: number) {
  const safe = Math.min(240, Math.max(5, Math.round(minutes)));
  await bumpSession({ minutes: safe });
  await log("study", `Sessão de ${safe} minutos`, "/progresso", "Tempo de estudo registrado");
  await refresh();
  return { ok: true };
}

export async function resetProgress() {
  await prisma.$transaction([
    prisma.lessonProgress.deleteMany({ where: { profileId: PROFILE_ID } }),
    prisma.exerciseProgress.deleteMany({ where: { profileId: PROFILE_ID } }),
    prisma.problemProgress.deleteMany({ where: { profileId: PROFILE_ID } }),
    prisma.projectProgress.deleteMany({ where: { profileId: PROFILE_ID } }),
    prisma.studySession.deleteMany({ where: { profileId: PROFILE_ID } }),
    prisma.reviewItem.deleteMany({ where: { profileId: PROFILE_ID } }),
    prisma.activityLog.deleteMany({ where: { profileId: PROFILE_ID } }),
  ]);
  await refresh({ everything: true });
  return { ok: true };
}
