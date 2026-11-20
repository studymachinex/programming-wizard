import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, ExternalLink, Terminal } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PROFILE_ID } from "@/lib/data";
import { cn, difficultyLabel, difficultyStyles } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { ExerciseWorkspace } from "@/components/exercise-workspace";
import { Breadcrumb, ProgressBar, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exercise = await prisma.exercise.findUnique({ where: { slug }, select: { title: true } });
  return { title: exercise?.title ?? "Exercício" };
}

export default async function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exercise = await prisma.exercise.findUnique({
    where: { slug },
    include: {
      track: { select: { title: true, slug: true, accent: true, icon: true } },
      module: { select: { title: true, slug: true } },
      progress: { where: { profileId: PROFILE_ID } },
    },
  });
  if (!exercise) notFound();

  const related = await prisma.exercise.findMany({
    where: { trackId: exercise.trackId, id: { not: exercise.id } },
    orderBy: { order: "asc" },
    take: 4,
    include: { progress: { where: { profileId: PROFILE_ID }, select: { status: true } } },
  });

  const progress = exercise.progress[0];
  const solved = progress?.status === "solved";
  const a = accentOf(exercise.track.accent);

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Exercícios", href: "/exercicios" },
          { label: exercise.track.title, href: `/trilhas/${exercise.track.slug}` },
          { label: exercise.title },
        ]}
      />

      <header className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider", difficultyStyles[exercise.difficulty])}>
            {difficultyLabel(exercise.difficulty)}
          </span>
          <span className={cn("flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wider", a.text)}>
            <TrackIcon icon={exercise.track.icon} className="h-2.5 w-2.5" />
            {exercise.track.title}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
            · {exercise.module.title}
          </span>
          {solved && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> resolvido
            </span>
          )}
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="max-w-3xl text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.03em] text-white sm:text-[2.35rem]">
              {exercise.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {exercise.tags.map((tag) => (
                <span key={tag} className="rounded border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 font-mono text-[9px] text-zinc-500">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-zinc-600">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> {exercise.estimatedMinutes} min
            </span>
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3 w-3" /> {progress?.attempts ?? 0} tentativas
            </span>
            {exercise.externalUrl && (
              <a
                href={exercise.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-arcane-300/70 hover:text-arcane-200"
              >
                <ExternalLink className="h-3 w-3" /> versão externa
              </a>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-700">
            progresso da trilha
          </span>
          <div className="h-1 w-32 rounded-full bg-white/[0.06]">
            <div className={cn("h-full rounded-full bg-gradient-to-r", a.gradient)} style={{ width: solved ? "100%" : "12%" }} />
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <div className="panel p-6">
            <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h2 className="text-[13px] font-medium text-white">Enunciado</h2>
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                leia até o fim antes de codar
              </span>
            </div>
            <Markdown content={exercise.statement} />
          </div>

          <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
            <p className="text-[11.5px] leading-relaxed text-amber-200/70">
              <strong className="font-medium text-amber-200">Como praticar:</strong> resolva no seu IDE
              com os testes da aba “Testes”. Só marque como resolvido quando todos passarem. Salve seu
              código aqui para voltar depois.
            </p>
          </div>
        </div>

        <div>
          <ExerciseWorkspace
            exerciseId={exercise.id}
            starterCode={exercise.starterCode}
            solutionCode={exercise.solutionCode}
            tests={exercise.tests}
            hints={exercise.hints}
            initialCode={progress?.code ?? ""}
            solved={solved}
            attempts={progress?.attempts ?? 0}
          />
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Continue praticando</h2>
            <Link href="/exercicios" className="text-[11px] text-zinc-600 hover:text-arcane-300">
              banco completo →
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {related.map((ex) => (
              <Link
                key={ex.id}
                href={`/exercicios/${ex.slug}`}
                className="panel glass-hover group flex items-center gap-3 p-3.5"
              >
                <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[8.5px] uppercase", difficultyStyles[ex.difficulty])}>
                  {difficultyLabel(ex.difficulty)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300 group-hover:text-white">
                  {ex.title}
                </span>
                {ex.progress[0]?.status === "solved" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                <ArrowRight className="h-3 w-3 shrink-0 text-zinc-700" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Link href={`/trilhas/${exercise.track.slug}`} className="flex items-center gap-1.5 text-[11.5px] text-zinc-500 hover:text-arcane-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para {exercise.track.title}
        </Link>
        <Link href="/exercicios" className="text-[11.5px] text-zinc-500 hover:text-arcane-300">
          Todos os exercícios →
        </Link>
      </div>
    </div>
  );
}
