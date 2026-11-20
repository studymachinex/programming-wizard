import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchResult = {
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] as SearchResult[] });

  const take = 6;

  const [tracks, lessons, exercises, problems, projects] = await Promise.all([
    prisma.track.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { subtitle: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 3,
      orderBy: { order: "asc" },
      select: { slug: true, title: true, subtitle: true },
    }),
    prisma.lesson.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      take,
      select: {
        slug: true,
        title: true,
        summary: true,
        track: { select: { slug: true, title: true } },
        module: { select: { title: true } },
      },
    }),
    prisma.exercise.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { tags: { has: q.toLowerCase() } },
          { statement: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 4,
      select: {
        slug: true,
        title: true,
        difficulty: true,
        track: { select: { title: true } },
      },
    }),
    prisma.externalProblem.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { topic: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 4,
      select: { title: true, platform: true, topic: true },
    }),
    prisma.project.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 3,
      select: { slug: true, title: true, level: true },
    }),
  ]);

  const results: SearchResult[] = [
    ...tracks.map((t) => ({
      type: "Trilha",
      title: t.title,
      subtitle: t.subtitle,
      href: `/trilhas/${t.slug}`,
    })),
    ...lessons.map((l) => ({
      type: "Aula",
      title: l.title,
      subtitle: `${l.track.title} · ${l.module.title}`,
      href: `/trilhas/${l.track.slug}/aulas/${l.slug}`,
    })),
    ...exercises.map((e) => ({
      type: "Exercício",
      title: e.title,
      subtitle: `${e.track.title} · ${e.difficulty}`,
      href: `/exercicios/${e.slug}`,
    })),
    ...problems.map((p) => ({
      type: "Desafio",
      title: p.title,
      subtitle: `${p.platform} · ${p.topic}`,
      href: `/desafios?q=${encodeURIComponent(p.title)}`,
    })),
    ...projects.map((p) => ({
      type: "Projeto",
      title: p.title,
      subtitle: `Capstone · ${p.level}`,
      href: `/projetos/${p.slug}`,
    })),
  ];

  return NextResponse.json({ results });
}
