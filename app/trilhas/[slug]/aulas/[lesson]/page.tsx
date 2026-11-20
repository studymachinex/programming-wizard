import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  ListTree,
  Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PROFILE_ID } from "@/lib/data";
import { cn, pct } from "@/lib/utils";
import { Markdown, extractHeadings } from "@/components/markdown";
import { LessonActions } from "@/components/lesson-actions";
import { LessonQuiz } from "@/components/lesson-quiz";
import { NotesPanel } from "@/components/notes-panel";
import { MiniRing } from "@/components/progress-ring";
import { Breadcrumb, ProgressBar, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

type Quiz = { question: string; options: string[]; answer: number; explanation: string }[];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lesson: string }>;
}) {
  const { slug, lesson } = await params;
  const data = await prisma.lesson.findFirst({
    where: { slug: lesson, track: { slug } },
    select: { title: true, summary: true },
  });
  return { title: data?.title ?? "Aula", description: data?.summary };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lesson: string }>;
}) {
  const { slug: trackSlug, lesson: lessonSlug } = await params;
  const track = await prisma.track.findFirst({
    where: { slug: trackSlug },
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
              estimatedMinutes: true,
              summary: true,
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
  if (!track) notFound();

  const lesson = await prisma.lesson.findFirst({
    where: { trackId: track.id, slug: lessonSlug },
    include: {
      module: true,
      progress: { where: { profileId: PROFILE_ID } },
    },
  });
  if (!lesson) notFound();

  const flat = track.modules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, moduleSlug: m.slug, moduleTitle: m.title })),
  );
  const index = flat.findIndex((l) => l.id === lesson.id);
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index < flat.length - 1 ? flat[index + 1] : null;
  const completedCount = flat.filter((l) => l.progress[0]?.status === "completed").length;
  const percent = pct(completedCount, flat.length);
  const progress = lesson.progress[0];
  const currentModule = track.modules.find((m) => m.id === lesson.moduleId)!;
  const a = accentOf(track.accent);
  const headings = extractHeadings(lesson.content);
  const quiz = (lesson.quiz as Quiz | null) ?? [];

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Trilhas", href: "/trilhas" },
          { label: track.title, href: `/trilhas/${track.slug}` },
          { label: lesson.title },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_292px]">
        <article className="min-w-0">
          {/* Header */}
          <header className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/60 p-6 sm:p-7">
            <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b opacity-60", a.soft)} />
            <div className="relative">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider", a.bg, a.border, a.text)}>
                  <TrackIcon icon={track.icon} className="h-2.5 w-2.5" />
                  {track.title}
                </span>
                <ChevronRight className="h-3 w-3 text-zinc-700" />
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">
                  Módulo {String(currentModule.order + 1).padStart(2, "0")} · {currentModule.title}
                </span>
              </div>
              <h1 className="max-w-3xl text-[1.8rem] font-semibold leading-[1.14] tracking-[-0.03em] text-white sm:text-[2.35rem]">
                {lesson.title}
              </h1>
              <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-zinc-400">{lesson.summary}</p>
              <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-white/[0.06] pt-4">
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                  <Clock className="h-3 w-3" /> {lesson.estimatedMinutes} min
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                  <BookOpen className="h-3 w-3" /> aula {index + 1} de {flat.length}
                </span>
                {progress?.status === "completed" && (
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> concluída
                  </span>
                )}
                <div className="ml-auto">
                  <LessonActions
                    lessonId={lesson.id}
                    completed={progress?.status === "completed"}
                    bookmarked={progress?.bookmarked ?? false}
                    compact
                  />
                </div>
              </div>
            </div>
          </header>

          <div className="mt-8">
            <Markdown content={lesson.content} />
          </div>

          <div className="mt-9 rounded-2xl border border-arcane-400/15 bg-gradient-to-br from-arcane-500/[0.07] to-transparent p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-arcane-300" />
              <h2 className="text-[14px] font-semibold text-white">O que levar desta aula</h2>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {lesson.takeaways.map((takeaway, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-400">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-arcane-400" />
                  {takeaway}
                </li>
              ))}
            </ul>
          </div>

          {quiz.length > 0 && (
            <div className="mt-6">
              <LessonQuiz questions={quiz} />
            </div>
          )}

          <div className="mt-6">
            <NotesPanel lessonId={lesson.id} initial={progress?.notes ?? ""} />
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link href={`/trilhas/${track.slug}/aulas/${prev.slug}`} className="panel glass-hover group flex items-start gap-3 p-4">
                <ArrowLeft className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-arcane-300" />
                <span className="min-w-0">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">anterior</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-zinc-300">{prev.title}</span>
                </span>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link href={`/trilhas/${track.slug}/aulas/${next.slug}`} className="panel glass-hover group flex items-start justify-end gap-3 p-4 text-right">
                <span className="min-w-0">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">próxima aula</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-zinc-300">{next.title}</span>
                </span>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-arcane-300" />
              </Link>
            ) : (
              <Link href={`/trilhas/${track.slug}`} className="panel glass-hover group flex items-start justify-end gap-3 p-4 text-right">
                <span>
                  <span className="block font-mono text-[9px] uppercase tracking-wider text-zinc-600">fim da trilha</span>
                  <span className="mt-0.5 block text-[12.5px] text-zinc-300">Voltar para a ementa</span>
                </span>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-arcane-300" />
              </Link>
            )}
          </div>

          <div className="mt-6 flex justify-center">
            <LessonActions
              lessonId={lesson.id}
              completed={progress?.status === "completed"}
              bookmarked={progress?.bookmarked ?? false}
            />
          </div>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="panel p-4">
              <div className="flex items-center gap-3">
                <div className="relative grid place-items-center">
                  <MiniRing value={percent} size={44} />
                  <span className="absolute font-mono text-[8px] text-arcane-200">{percent}%</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-medium text-zinc-200">{track.title}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                    {completedCount}/{flat.length} aulas
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={percent} gradient={a.gradient} />
              </div>
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <p className="mb-2 font-mono text-[8.5px] uppercase tracking-[0.15em] text-zinc-600">{currentModule.title}</p>
                <div className="max-h-[240px] space-y-0.5 overflow-y-auto pr-1">
                  {currentModule.lessons.map((l) => {
                    const active = l.id === lesson.id;
                    const done = l.progress[0]?.status === "completed";
                    return (
                      <Link
                        key={l.id}
                        href={`/trilhas/${track.slug}/aulas/${l.slug}`}
                        className={cn(
                          "flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] leading-snug transition-colors",
                          active
                            ? "bg-arcane-500/[0.12] text-arcane-100"
                            : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300",
                        )}
                      >
                        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", done ? "bg-emerald-400" : active ? "bg-arcane-400" : "bg-zinc-700")} />
                        {l.title}
                      </Link>
                    );
                  })}
                </div>
                <Link
                  href={`/trilhas/${track.slug}`}
                  className="mt-2 block border-t border-white/[0.06] pt-3 font-mono text-[9px] uppercase tracking-wider text-zinc-600 transition-colors hover:text-arcane-300"
                >
                  ver ementa completa →
                </Link>
              </div>
            </div>

            {headings.length > 0 && (
              <div className="panel p-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <ListTree className="h-3.5 w-3.5 text-zinc-600" />
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-zinc-600">nesta aula</p>
                </div>
                <nav className="space-y-1">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={cn(
                        "block border-l py-0.5 text-[10.5px] leading-snug text-zinc-500 transition-colors hover:text-arcane-200",
                        heading.level === 3 ? "pl-5" : "pl-3",
                        "border-white/[0.07] hover:border-arcane-400/50",
                      )}
                    >
                      {heading.text}
                    </a>
                  ))}
                </nav>
              </div>
            )}

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-zinc-600">regra de ouro</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                Não avance sem conseguir explicar o conceito em voz alta e escrever o código do zero.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
