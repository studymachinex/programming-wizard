import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROFILE_ID } from "@/lib/data";
import { todayKey } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await prisma.profile.findUnique({ where: { id: PROFILE_ID } });

  const [lessons, exercises, problems, projects, sessions, reviews, activity] = await Promise.all([
    prisma.lessonProgress.findMany({
      where: { profileId: PROFILE_ID },
      include: {
        lesson: {
          select: {
            slug: true,
            title: true,
            track: { select: { slug: true, title: true } },
            module: { select: { slug: true, title: true } },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.exerciseProgress.findMany({
      where: { profileId: PROFILE_ID },
      include: {
        exercise: {
          select: {
            slug: true,
            title: true,
            difficulty: true,
            track: { select: { slug: true, title: true } },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.problemProgress.findMany({
      where: { profileId: PROFILE_ID },
      include: {
        problem: {
          select: {
            slug: true,
            title: true,
            platform: true,
            url: true,
            difficulty: true,
            track: { select: { slug: true, title: true } },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.projectProgress.findMany({
      where: { profileId: PROFILE_ID },
      include: {
        project: { select: { slug: true, title: true, level: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.studySession.findMany({
      where: { profileId: PROFILE_ID },
      orderBy: { day: "asc" },
    }),
    prisma.reviewItem.findMany({
      where: { profileId: PROFILE_ID },
      orderBy: { dueAt: "asc" },
    }),
    prisma.activityLog.findMany({
      where: { profileId: PROFILE_ID },
      orderBy: { createdAt: "asc" },
      take: 2000,
    }),
  ]);

  const payload = {
    app: "Programming Wizard",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile
      ? {
          id: profile.id,
          name: profile.name,
          dailyGoalMinutes: profile.dailyGoalMinutes,
          targetRole: profile.targetRole,
          createdAt: profile.createdAt,
        }
      : null,
    lessons: lessons.map((row) => ({
      track: row.lesson.track.slug,
      trackTitle: row.lesson.track.title,
      module: row.lesson.module.slug,
      moduleTitle: row.lesson.module.title,
      slug: row.lesson.slug,
      title: row.lesson.title,
      status: row.status,
      notes: row.notes,
      bookmarked: row.bookmarked,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
    })),
    exercises: exercises.map((row) => ({
      track: row.exercise.track.slug,
      trackTitle: row.exercise.track.title,
      slug: row.exercise.slug,
      title: row.exercise.title,
      difficulty: row.exercise.difficulty,
      status: row.status,
      code: row.code,
      attempts: row.attempts,
      notes: row.notes,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
    })),
    problems: problems.map((row) => ({
      track: row.problem.track?.slug ?? null,
      slug: row.problem.slug,
      title: row.problem.title,
      platform: row.problem.platform,
      url: row.problem.url,
      difficulty: row.problem.difficulty,
      status: row.status,
      notes: row.notes,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
    })),
    projects: projects.map((row) => ({
      slug: row.project.slug,
      title: row.project.title,
      level: row.project.level,
      status: row.status,
      repoUrl: row.repoUrl,
      notes: row.notes,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
    })),
    studySessions: sessions.map((row) => ({
      day: row.day,
      minutes: row.minutes,
      lessonsDone: row.lessonsDone,
      exercisesDone: row.exercisesDone,
      problemsDone: row.problemsDone,
    })),
    reviews: reviews.map((row) => ({
      kind: row.kind,
      refId: row.refId,
      title: row.title,
      href: row.href,
      dueAt: row.dueAt,
      intervalDays: row.intervalDays,
      ease: row.ease,
      repetitions: row.repetitions,
      lastReviewedAt: row.lastReviewedAt,
    })),
    activity: activity.map((row) => ({
      kind: row.kind,
      title: row.title,
      href: row.href,
      detail: row.detail,
      createdAt: row.createdAt,
    })),
  };

  const filename = `programming-wizard-backup-${todayKey()}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
