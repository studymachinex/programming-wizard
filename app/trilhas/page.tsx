import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock,
  Code2,
  Compass,
  Layers,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { getTrackSummaries } from "@/lib/data";
import { cn, levelLabel, pct } from "@/lib/utils";
import { EmptyState, LevelBadge, PageHeader, ProgressBar, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

const stages = [
  {
    id: "fundacao",
    label: "Fase 01 · Fundação",
    title: "Linguagem, design e estruturas",
    description: "Sem isso, todo o resto vira decoreba. Aqui você constrói o alicerce que entrevistador nenhum consegue furar.",
    slugs: ["java-fundamentos", "poo-design", "estruturas-dados"],
  },
  {
    id: "engenharia",
    label: "Fase 02 · Engenharia",
    title: "Java de produção, dados e backend",
    description: "O nível em que você para de 'fazer funcionar' e começa a projetar sistemas que aguentam tráfego, mudanças e incidentes.",
    slugs: ["java-avancado", "sql-postgres", "redes-backend", "quarkus-backend"],
  },
  {
    id: "escala",
    label: "Fase 03 · Escala",
    title: "Mensageria, NoSQL, reatividade e cloud",
    description: "As ferramentas e decisões que aparecem em vagas sênior: Kafka, MongoDB, Redis, concorrência reativa, consistência, containers e SRE.",
    slugs: ["kafka-streaming", "mongodb-redis", "reatividade-async", "sistemas-distribuidos", "docker", "cloud-devops"],
  },
  {
    id: "entrevista",
    label: "Fase 04 · Entrevista",
    title: "Padrões avançados, machine coding e system design",
    description: "A reta final: transformar conhecimento em performance de entrevista para Netflix, Uber, Google e afins.",
    slugs: ["algoritmos-avancados", "machine-coding-lld", "system-design-interview"],
  },
];

export default async function TracksPage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string }>;
}) {
  const { nivel } = await searchParams;
  const tracks = await getTrackSummaries();
  const totalHours = tracks.reduce((s, t) => s + t.estimatedHours, 0);
  const totalLessons = tracks.reduce((s, t) => s + t.lessonCount, 0);
  const totalExercises = tracks.reduce((s, t) => s + t.exerciseCount, 0);
  const totalProblems = tracks.reduce((s, t) => s + t.problemCount, 0);
  const filtered = nivel ? tracks.filter((t) => t.level === nivel) : tracks;
  const levels = ["fundamento", "intermediario", "avancado", "especialista"];
  const bySlug = new Map(filtered.map((t) => [t.slug, t]));
  const completedLessons = tracks.reduce((s, t) => s + t.lessonsDone, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Currículo completo"
        title={
          <>
            Do zero ao <span className="font-display italic text-arcane-200">sênior</span>.
            <br className="hidden sm:block" /> Uma trilha por vez.
          </>
        }
        description={
          <>
            {tracks.length} trilhas, {totalLessons} aulas, {totalExercises} exercícios com código Java e{" "}
            {totalProblems} desafios externos curados. Progressão pensada para entrevistas de
            Netflix, Uber, Google — e para o dia a dia de quem constrói sistemas grandes de verdade.
          </>
        }
        actions={
          <>
            <div className="panel flex items-center gap-4 px-4 py-2.5">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">seu progresso</p>
                <p className="mt-0.5 text-sm font-medium text-white">
                  {completedLessons} <span className="text-zinc-500">/ {totalLessons} aulas</span>
                </p>
              </div>
              <div className="h-8 w-px bg-white/[0.07]" />
              <p className="font-mono text-lg font-semibold text-arcane-300">
                {pct(completedLessons, totalLessons)}%
              </p>
            </div>
          </>
        }
      />

      {/* stats strip */}
      <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.05] sm:grid-cols-4">
        {[
          { icon: Layers, label: "trilhas", value: tracks.length },
          { icon: BookOpen, label: "aulas", value: totalLessons },
          { icon: Code2, label: "exercícios", value: totalExercises },
          { icon: Clock, label: "horas estimadas", value: `${totalHours}h` },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 bg-ink-900/90 px-5 py-4">
            <item.icon className="h-4 w-4 text-zinc-600" />
            <div>
              <p className="text-lg font-semibold leading-none text-white">{item.value}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <Link
          href="/trilhas"
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[11.5px] transition-colors",
            !nivel
              ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-100"
              : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
          )}
        >
          Todas
        </Link>
        {levels.map((level) => {
          const count = tracks.filter((t) => t.level === level).length;
          return (
            <Link
              key={level}
              href={`/trilhas?nivel=${level}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[11.5px] transition-colors",
                nivel === level
                  ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-100"
                  : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
              )}
            >
              {levelLabel(level)} <span className="text-zinc-700">· {count}</span>
            </Link>
          );
        })}
        <span className="ml-auto hidden items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600 sm:flex">
          <Compass className="h-3 w-3" /> siga a ordem das fases
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma trilha neste nível"
          description="O conteúdo ainda está sendo carregado. Rode o seed para popular o currículo."
          action={
            <Link href="/trilhas" className="btn-secondary">
              Ver todas
            </Link>
          }
        />
      ) : nivel ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((track) => (
            <TrackCard key={track.slug} track={track} />
          ))}
        </div>
      ) : (
        <div className="space-y-12">
          {stages.map((stage) => {
            const stageTracks = stage.slugs.map((s) => bySlug.get(s)).filter(Boolean);
            if (!stageTracks.length) return null;
            return (
              <section key={stage.id}>
                <div className="mb-5 flex flex-col gap-1 border-l-2 border-arcane-400/30 pl-4">
                  <p className="eyebrow">{stage.label}</p>
                  <h2 className="text-xl font-semibold tracking-tight text-white">{stage.title}</h2>
                  <p className="max-w-3xl text-[12.5px] leading-relaxed text-zinc-500">{stage.description}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {stageTracks.map((track) => track && <TrackCard key={track.slug} track={track} />)}
                </div>
              </section>
            );
          })}

          {/* tracks not in stages */}
          {(() => {
            const placed = new Set(stages.flatMap((s) => s.slugs));
            const rest = filtered.filter((t) => !placed.has(t.slug));
            if (!rest.length) return null;
            return (
              <section>
                <h2 className="mb-4 text-xl font-semibold tracking-tight text-white">Outras trilhas</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {rest.map((track) => (
                    <TrackCard key={track.slug} track={track} />
                  ))}
                </div>
              </section>
            );
          })()}
        </div>
      )}

      <div className="mt-12 grid gap-4 rounded-2xl border border-arcane-400/15 bg-gradient-to-br from-arcane-500/[0.07] to-transparent p-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="eyebrow mb-1.5">Não sabe por onde começar?</p>
          <h3 className="text-lg font-semibold text-white">Siga o plano de 24 semanas</h3>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-zinc-400">
            Um cronograma realista de 10–15h por semana, com fases, metas semanais, mock interviews e
            critérios de aprovação. Feito para quem trabalha e estuda.
          </p>
        </div>
        <Link href="/plano" className="btn-primary">
          Abrir plano <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function TrackCard({ track }: { track: Awaited<ReturnType<typeof getTrackSummaries>>[number] }) {
  const a = accentOf(track.accent);
  const done = track.percent === 100;
  return (
    <Link
      href={`/trilhas/${track.slug}`}
      draggable={false}
      className="panel glass-hover group relative flex select-none flex-col overflow-hidden p-5"
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b opacity-60", a.soft)} />
      <div className="relative flex items-start justify-between gap-3">
        <span className={cn("grid h-11 w-11 place-items-center rounded-xl border", a.bg, a.border, a.text)}>
          <TrackIcon icon={track.icon} className="h-[21px] w-[21px]" />
        </span>
        <div className="flex flex-col items-end gap-1.5">
          <LevelBadge level={track.level} />
          {track.isCore && (
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-ember/70">
              <Star className="h-2.5 w-2.5 fill-current" /> essencial
            </span>
          )}
        </div>
      </div>

      <div className="relative mt-4">
        <h3 className="text-[15.5px] font-semibold tracking-tight text-white group-hover:text-arcane-100">
          {track.title}
        </h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500">{track.subtitle}</p>
        <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-600">{track.description}</p>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 font-mono text-[9.5px] text-zinc-500">
        <span className="flex items-center gap-1">
          <BookOpen className="h-3 w-3 text-zinc-600" /> {track.lessonCount}
        </span>
        <span className="flex items-center gap-1">
          <Code2 className="h-3 w-3 text-zinc-600" /> {track.exerciseCount}
        </span>
        <span className="flex items-center gap-1">
          <Trophy className="h-3 w-3 text-zinc-600" /> {track.problemCount}
        </span>
      </div>

      <div className="relative mt-auto pt-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className={cn("font-mono", done ? "text-emerald-400" : "text-zinc-600")}>
            {done ? "trilha concluída" : `${track.lessonsDone}/${track.lessonCount} aulas`}
          </span>
          <span className="font-mono text-zinc-500">{track.percent}%</span>
        </div>
        <div className="mt-1.5">
          <ProgressBar value={track.percent} gradient={a.gradient} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-700">
            {track.estimatedHours}h estimadas
          </span>
          <span className="flex items-center gap-1 text-[10.5px] text-arcane-300/80 transition-colors group-hover:text-arcane-200">
            {track.percent > 0 && !done ? "continuar" : "abrir"}
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
