import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Code2,
  ExternalLink,
  PlayCircle,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { getTrackPageData } from "@/lib/data";
import { cn, difficultyStyles, difficultyLabel, pct } from "@/lib/utils";
import { ProblemToggle } from "@/components/problem-toggle";
import {
  Breadcrumb,
  LevelBadge,
  ProgressBar,
  TrackIcon,
  accentOf,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const track = await getTrackPageData(slug);
  return { title: track?.title ?? "Trilha", description: track?.subtitle };
}

export default async function TrackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const track = await getTrackPageData(slug);
  if (!track) notFound();

  const allLessons = track.modules.flatMap((m) => m.lessons);
  const lessonsDone = allLessons.filter((l) => l.progress[0]?.status === "completed").length;
  const percent = pct(lessonsDone, allLessons.length);
  const nextLesson = allLessons.find((l) => l.progress[0]?.status !== "completed");
  const exs = track.modules.flatMap((m) => m.exercises);
  const exDone = exs.filter((e) => e.progress[0]?.status === "solved").length;
  const probDone = track.problems.filter((p) => p.progress[0]?.status === "solved").length;
  const a = accentOf(track.accent);

  return (
    <div>
      <Breadcrumb items={[{ label: "Trilhas", href: "/trilhas" }, { label: track.title }]} />

      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-850/80 p-6 shadow-card sm:p-8">
        <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80", a.soft)} />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-arcane-500/[0.08] blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <span className={cn("grid h-11 w-11 place-items-center rounded-xl border", a.bg, a.border, a.text)}>
                <TrackIcon icon={track.icon} className="h-5 w-5" />
              </span>
              <LevelBadge level={track.level} />
              {track.isCore && (
                <span className="flex items-center gap-1 rounded-full border border-ember/20 bg-ember/[0.07] px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ember/90">
                  <Star className="h-2.5 w-2.5 fill-current" /> trilha essencial
                </span>
              )}
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
                {track.modules.length} módulos · {track.estimatedHours}h
              </span>
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[2.6rem]">
              {track.title}
            </h1>
            <p className="mt-2 text-[15px] text-arcane-200/90">{track.subtitle}</p>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-zinc-400">{track.description}</p>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {nextLesson ? (
                <Link
                  href={`/trilhas/${track.slug}/aulas/${nextLesson.slug}`}
                  className="btn-primary"
                >
                  <PlayCircle className="h-4 w-4" />
                  {lessonsDone > 0 ? "Continuar trilha" : "Começar trilha"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Link href="/desafios" className="btn-primary">
                  <Trophy className="h-4 w-4" /> Trilha concluída · praticar desafios
                </Link>
              )}
              <Link href={`/desafios?trilha=${track.slug}`} className="btn-secondary">
                <Trophy className="h-4 w-4 text-zinc-500" /> {track.problems.length} desafios
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.07] bg-ink-950/40 p-5">
            <div>
              <div className="flex items-end justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
                  progresso
                </span>
                <span className="text-2xl font-semibold text-white">{percent}%</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={percent} gradient={a.gradient} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] py-2.5">
                <p className="text-sm font-semibold text-white">
                  {lessonsDone}<span className="text-[10px] font-normal text-zinc-600">/{allLessons.length}</span>
                </p>
                <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">aulas</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] py-2.5">
                <p className="text-sm font-semibold text-white">
                  {exDone}<span className="text-[10px] font-normal text-zinc-600">/{exs.length}</span>
                </p>
                <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">exercícios</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] py-2.5">
                <p className="text-sm font-semibold text-white">
                  {probDone}<span className="text-[10px] font-normal text-zinc-600">/{track.problems.length}</span>
                </p>
                <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">desafios</p>
              </div>
            </div>
            {nextLesson && (
              <p className="text-[10.5px] leading-relaxed text-zinc-600">
                <span className="text-zinc-500">Próxima:</span> {nextLesson.title}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
        {/* Module timeline */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-white">Ementa da trilha</h2>
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
              {track.modules.length} módulos
            </span>
          </div>
          <div className="space-y-3">
            {track.modules.map((mod, index) => {
              const modDone = mod.lessons.filter((l) => l.progress[0]?.status === "completed").length;
              const modPercent = pct(modDone, mod.lessons.length);
              const hasNext = mod.lessons.some((l) => l.id === nextLesson?.id);
              const isOpen = hasNext || (index === 0 && lessonsDone === 0);
              return (
                <details
                  key={mod.id}
                  open={isOpen}
                  className="group panel overflow-hidden [&[open]]:border-arcane-400/15"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden">
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-lg border font-mono text-[12px] font-semibold",
                        modPercent === 100
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                          : "border-white/[0.08] bg-white/[0.03] text-zinc-400"
                      )}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-medium text-white">{mod.title}</h3>
                        {modPercent === 100 && (
                          <span className="font-mono text-[8.5px] uppercase tracking-wider text-emerald-400/70">
                            concluído
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11.5px] text-zinc-500">{mod.description}</p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-3 sm:flex">
                      <span className="font-mono text-[9.5px] text-zinc-600">
                        {modDone}/{mod.lessons.length}
                      </span>
                      <div className="w-16">
                        <ProgressBar value={modPercent} gradient={a.gradient} />
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="border-t border-white/[0.05]">
                    <div className="divide-y divide-white/[0.04]">
                      {mod.lessons.map((lesson) => {
                        const status = lesson.progress[0]?.status ?? "not_started";
                        return (
                          <Link
                            key={lesson.id}
                            href={`/trilhas/${track.slug}/aulas/${lesson.slug}`}
                            className="group/lesson flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/[0.025]"
                          >
                            {status === "completed" ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" />
                            ) : status === "in_progress" ? (
                              <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-arcane-300" />
                            ) : (
                              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "text-[12.5px] transition-colors group-hover/lesson:text-white",
                                  status === "completed" ? "text-zinc-500" : "text-zinc-300"
                                )}
                              >
                                {lesson.title}
                              </p>
                              <p className="mt-0.5 line-clamp-1 text-[10.5px] text-zinc-600">
                                {lesson.summary}
                              </p>
                            </div>
                            <span className="mt-0.5 flex shrink-0 items-center gap-1 font-mono text-[9px] text-zinc-600">
                              <Clock className="h-2.5 w-2.5" /> {lesson.estimatedMinutes}m
                            </span>
                            {lesson.progress[0]?.bookmarked && (
                              <Star className="mt-0.5 h-3 w-3 shrink-0 fill-ember/60 text-ember/60" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                    {mod.exercises.length > 0 && (
                      <div className="border-t border-white/[0.04] bg-white/[0.012] px-5 py-3">
                        <p className="mb-2 font-mono text-[8.5px] uppercase tracking-[0.15em] text-zinc-600">
                          pratique este módulo
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {mod.exercises.map((ex) => {
                            const solved = ex.progress[0]?.status === "solved";
                            return (
                              <Link
                                key={ex.id}
                                href={`/exercicios/${ex.slug}`}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] transition-colors",
                                  solved
                                    ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300/80"
                                    : "border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:border-arcane-400/25 hover:text-arcane-200"
                                )}
                              >
                                {solved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Code2 className="h-2.5 w-2.5" />}
                                {ex.title}
                                <span className="text-[8.5px] text-zinc-600">{ex.estimatedMinutes}m</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="eyebrow mb-3">O que você sai sabendo</p>
            <ul className="space-y-2.5">
              {track.outcomes.map((outcome, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-400">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-arcane-400/60" />
                  {outcome}
                </li>
              ))}
            </ul>
          </div>

          {track.problems.length > 0 && (
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <p className="eyebrow">Desafios recomendados</p>
                <Link href={`/desafios?trilha=${track.slug}`} className="text-[10px] text-zinc-600 hover:text-arcane-300">
                  ver todos
                </Link>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {track.problems.slice(0, 6).map((problem) => {
                  const solved = problem.progress[0]?.status === "solved";
                  return (
                    <div key={problem.id} className="flex items-center gap-2 px-4 py-2.5">
                      <ProblemToggle problemId={problem.id} solved={solved} compact />
                      <a
                        href={problem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group min-w-0 flex-1"
                      >
                        <p className="truncate text-[11.5px] text-zinc-300 group-hover:text-white">
                          {problem.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">
                          {problem.platform} · {problem.topic}
                        </p>
                      </a>
                      <ExternalLink className="h-3 w-3 shrink-0 text-zinc-700" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="panel p-5">
            <p className="eyebrow mb-3">Como estudar</p>
            <ol className="space-y-3">
              {[
                "Leia a aula ativa: execute cada exemplo no seu IDE, não apenas leia.",
                "Faça o exercício local do módulo sem olhar a solução por 20 minutos.",
                "Resolva os desafios externos no nível indicado e registre o padrão usado.",
                "Volte na revisão espaçada em 1, 3, 7 e 21 dias.",
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11.5px] leading-relaxed text-zinc-500">
                  <span className="font-mono text-[9px] text-arcane-400/70">0{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
