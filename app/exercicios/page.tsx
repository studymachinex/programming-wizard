import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Filter,
  ListChecks,
  Search,
  Terminal,
  Trophy,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PROFILE_ID } from "@/lib/data";
import { cn, difficultyLabel, difficultyStyles, pct } from "@/lib/utils";
import { EmptyState, PageHeader, ProgressBar, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ dificuldade?: string; trilha?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const [exercises, tracks] = await Promise.all([
    prisma.exercise.findMany({
      orderBy: [{ trackId: "asc" }, { order: "asc" }],
      include: {
        track: { select: { title: true, slug: true, accent: true, icon: true } },
        progress: { where: { profileId: PROFILE_ID }, select: { status: true, attempts: true } },
      },
    }),
    prisma.track.findMany({
      orderBy: { order: "asc" },
      select: { id: true, slug: true, title: true, accent: true, icon: true },
    }),
  ]);

  const total = exercises.length;
  const solved = exercises.filter((e) => e.progress[0]?.status === "solved").length;
  const byDifficulty = ["facil", "medio", "dificil", "especialista"].map((d) => ({
    key: d,
    total: exercises.filter((e) => e.difficulty === d).length,
    solved: exercises.filter((e) => e.difficulty === d && e.progress[0]?.status === "solved").length,
  }));

  const filtered = exercises.filter((e) => {
    if (params.dificuldade && e.difficulty !== params.dificuldade) return false;
    if (params.trilha && e.track.slug !== params.trilha) return false;
    if (params.status === "resolvidos" && e.progress[0]?.status !== "solved") return false;
    if (params.status === "pendentes" && e.progress[0]?.status === "solved") return false;
    if (params.q) {
      const q = params.q.toLowerCase();
      const haystack = `${e.title} ${e.tags.join(" ")} ${e.track.title}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  function hrefWith(patch: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const merged = { ...params, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return `/exercicios${qs ? `?${qs}` : ""}`;
  }

  const hasFilters = Boolean(params.dificuldade || params.trilha || params.status || params.q);
  const tracksWithExercises = tracks.filter((t) => exercises.some((e) => e.track.slug === t.slug));

  return (
    <div>
      <PageHeader
        eyebrow="Prática deliberada"
        title={
          <>
            Exercícios para <span className="font-display italic text-arcane-200">codar</span>,
            não para assistir.
          </>
        }
        description="Implemente estruturas do zero, resolva problemas de engenharia e compare com uma solução de referência comentada. Tudo em Java 21, com testes e critérios de aceite."
        actions={
          <div className="panel flex items-center gap-4 px-4 py-2.5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">resolvidos</p>
              <p className="mt-0.5 text-sm font-medium text-white">
                {solved} <span className="text-zinc-500">/ {total}</span>
              </p>
            </div>
            <div className="h-8 w-px bg-white/[0.07]" />
            <p className="font-mono text-lg font-semibold text-arcane-300">{pct(solved, total)}%</p>
          </div>
        }
      />

      {/* difficulty summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {byDifficulty.map((d) => (
          <div key={d.key} className="panel p-4">
            <div className="flex items-center justify-between">
              <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider", difficultyStyles[d.key])}>
                {difficultyLabel(d.key)}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                {d.solved}/{d.total}
              </span>
            </div>
            <div className="mt-3">
              <ProgressBar value={pct(d.solved, d.total)} />
            </div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            <Filter className="h-3 w-3" /> nível
          </span>
          <Link
            href={hrefWith({ dificuldade: undefined })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] transition-colors",
              !params.dificuldade
                ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-100"
                : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
            )}
          >
            todos
          </Link>
          {["facil", "medio", "dificil", "especialista"].map((d) => (
            <Link
              key={d}
              href={hrefWith({ dificuldade: d })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] transition-colors",
                params.dificuldade === d
                  ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-100"
                  : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
              )}
            >
              {difficultyLabel(d)}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-white/[0.07]" />
          {[
            ["resolvidos", "resolvidos"],
            ["pendentes", "pendentes"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={hrefWith({ status: params.status === key ? undefined : key })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] transition-colors",
                params.status === key
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                  : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
              )}
            >
              {label}
            </Link>
          ))}
          {hasFilters && (
            <Link href="/exercicios" className="text-[10.5px] text-zinc-600 underline-offset-4 hover:text-arcane-300 hover:underline">
              limpar
            </Link>
          )}
          <form action="/exercicios" className="ml-auto flex items-center gap-1.5">
            <div className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5">
              <Search className="h-3 w-3 text-zinc-600" />
              <input
                name="q"
                defaultValue={params.q}
                placeholder="buscar exercício..."
                className="w-36 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700"
              />
            </div>
          </form>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Link
            href={hrefWith({ trilha: undefined })}
            className={cn(
              "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors",
              !params.trilha
                ? "border-arcane-400/25 bg-arcane-500/10 text-arcane-200"
                : "border-white/[0.06] text-zinc-600 hover:text-zinc-300"
            )}
          >
            todas as trilhas
          </Link>
          {tracksWithExercises.map((track) => {
            const a = accentOf(track.accent);
            return (
              <Link
                key={track.slug}
                href={hrefWith({ trilha: track.slug })}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] transition-colors",
                  params.trilha === track.slug
                    ? cn(a.bg, a.border, a.text)
                    : "border-white/[0.06] text-zinc-600 hover:text-zinc-300"
                )}
              >
                <TrackIcon icon={track.icon} className="h-2.5 w-2.5" />
                {track.title}
              </Link>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Code2 className="h-5 w-5" />}
          title="Nenhum exercício encontrado"
          description="Ajuste os filtros ou rode o seed para carregar o banco de exercícios."
          action={
            <Link href="/exercicios" className="btn-secondary">
              Limpar filtros
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((exercise) => {
            const progress = exercise.progress[0];
            const isSolved = progress?.status === "solved";
            const a = accentOf(exercise.track.accent);
            return (
              <Link
                key={exercise.id}
                href={`/exercicios/${exercise.slug}`}
                className="panel glass-hover group flex flex-col p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider", difficultyStyles[exercise.difficulty])}>
                      {difficultyLabel(exercise.difficulty)}
                    </span>
                    <span className={cn("flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider", a.text, "opacity-70")}>
                      <TrackIcon icon={exercise.track.icon} className="h-2.5 w-2.5" />
                      {exercise.track.title}
                    </span>
                  </div>
                  {isSolved ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : progress?.attempts ? (
                    <span className="font-mono text-[9px] text-amber-400/70">{progress.attempts} tentativas</span>
                  ) : null}
                </div>

                <h3 className="mt-3 text-[14px] font-medium leading-snug text-zinc-100 group-hover:text-white">
                  {exercise.title}
                </h3>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {exercise.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[8.5px] text-zinc-600">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-white/[0.05] pt-3 text-[10px] text-zinc-600">
                  <span className="flex items-center gap-1.5 font-mono text-[9px]">
                    <Clock className="h-3 w-3" /> {exercise.estimatedMinutes} min
                  </span>
                  <span className="flex items-center gap-1 text-arcane-300/70 transition-colors group-hover:text-arcane-200">
                    {isSolved ? "revisar solução" : "abrir desafio"}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Terminal, title: "Escreva no seu IDE", text: "A plataforma guarda seu código e progresso, mas a melhor prática é compilar e rodar os testes localmente." },
          { icon: ListChecks, title: "Sem olhar a solução", text: "Dê 20 minutos de tentativa real. Depois, compare sua abordagem com a referência e anote a diferença." },
          { icon: Trophy, title: "Suba de nível", text: "Quando acertar um exercício fácil em menos de 15 min, avance para o próximo nível de dificuldade." },
        ].map((item) => (
          <div key={item.title} className="panel p-5">
            <item.icon className="h-4 w-4 text-arcane-300/70" />
            <h3 className="mt-3 text-[12.5px] font-medium text-white">{item.title}</h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-500">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
