import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Code2,
  ExternalLink,
  Flame,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { getDashboardData } from "@/lib/data";
import { cn, formatDate, formatMinutes, greeting, pct, relativeTime, todayKey } from "@/lib/utils";
import { Heatmap } from "@/components/heatmap";
import { ProgressRing } from "@/components/progress-ring";
import { StudyTimer } from "@/components/study-timer";
import { LevelBadge, ProgressBar, SectionTitle, StatCard, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

const activityIcons: Record<string, typeof BookOpen> = {
  lesson: BookOpen,
  exercise: Code2,
  problem: Trophy,
  review: RotateCcw,
  study: Zap,
  project: Sparkles,
};

export default async function DashboardPage() {
  const { profile, stats, tracks, heatmap, plan, activity, reviews } = await getDashboardData();
  const overall = pct(stats.lessonsDone, stats.lessonsTotal);
  const today = new Date();
  const goalPercent = pct(stats.todayMinutes, profile.dailyGoalMinutes);
  const continueTrack = tracks.find((t) => t.slug === plan.target?.trackSlug);
  const focusTracks = [
    ...tracks.filter((t) => t.lessonsDone > 0).slice(0, 2),
    ...tracks.filter((t) => t.isCore && t.lessonsDone === 0).slice(0, 2),
  ].slice(0, 4);
  const nextUp = plan.target;

  return (
    <div className="space-y-9">
      {/* ---------- Hero ---------- */}
      <section className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-ink-850/90 via-ink-850/70 to-ink-900/40 p-6 shadow-card sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full bg-arcane-500/[0.12] blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-px w-1/2 bg-gradient-to-r from-transparent via-arcane-400/40 to-transparent" />
          <p className="eyebrow mb-4 flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            {today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500 normal-case tracking-normal">rumo a {profile.targetRole}</span>
          </p>
          <h1 className="max-w-2xl text-[2.15rem] font-semibold leading-[1.06] tracking-[-0.035em] text-white sm:text-[2.9rem]">
            {greeting()}, 
            <span className="bg-gradient-to-r from-arcane-200 via-arcane-300 to-mana bg-clip-text font-display italic text-transparent">
            {profile.name}.{" "}
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-zinc-400">
            {stats.lessonsDone === 0
              ? "Sua jornada começa agora. Escolha uma trilha, estude 25 minutos e registre o primeiro dia — consistência vence intensidade."
              : `Você já concluiu ${stats.lessonsDone} aulas e resolveu ${stats.exercisesDone + stats.problemsDone} desafios. O próximo passo está logo abaixo.`}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {nextUp ? (
              <Link
                href={`/trilhas/${nextUp.trackSlug}/aulas/${nextUp.slug}`}
                className="btn-primary group"
              >
                <Play className="h-4 w-4 fill-current" />
                Continuar aula
                <span className="hidden max-w-[220px] truncate text-[12px] font-normal text-white/60 sm:inline">
                  · {nextUp.title}
                </span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <Link href="/trilhas" className="btn-primary">
                <Sparkles className="h-4 w-4" /> Explorar trilhas
              </Link>
            )}
            <Link href="/plano" className="btn-secondary">
              <Target className="h-4 w-4" /> Ver plano de 24 semanas
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-4 font-mono text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rune" />
              {stats.lessonsTotal} aulas no total
            </span>
            <span>{stats.exercisesTotal} exercícios locais</span>
            <span>{stats.problemsTotal} desafios externos</span>
            <span className="text-arcane-400/70">100% Java</span>
          </div>
        </div>

        <div className="panel relative flex flex-col items-center justify-center overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(139,92,246,0.14),transparent_65%)]" />
          <div className="absolute left-4 top-4 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
            jornada total
          </div>
          <div className="mt-4 flex items-center justify-center">
            <ProgressRing value={overall} size={168} stroke={10}>
              <div>
                <div className="text-4xl font-semibold tracking-tight text-white">{overall}%</div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  concluído
                </div>
              </div>
            </ProgressRing>
          </div>
          <div className="mt-5 grid w-full grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06] pt-4 text-center">
            <div>
              <p className="text-lg font-semibold text-white">{stats.lessonsDone}</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">aulas</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{stats.exercisesDone}</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">exercícios</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{stats.problemsDone}</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">desafios</p>
            </div>
          </div>
          <Link
            href="/progresso"
            className="mt-4 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-arcane-400/70 transition-colors hover:text-arcane-200"
          >
            ver análise completa <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sequência atual"
          value={`${stats.streak} ${stats.streak === 1 ? "dia" : "dias"}`}
          hint={stats.streak > 0 ? "Mantenha o fogo aceso hoje" : "Estude hoje para iniciar a sequência"}
          icon={<Flame className="h-4 w-4" />}
          accent="ember"
        />
        <StatCard
          label="Tempo de estudo"
          value={formatMinutes(stats.minutes)}
          hint={`${stats.todayMinutes} min hoje`}
          icon={<Zap className="h-4 w-4" />}
          accent="arcane"
        />
        <StatCard
          label="Aulas concluídas"
          value={`${stats.lessonsDone}`}
          hint={`de ${stats.lessonsTotal} · ${overall}%`}
          icon={<BookOpen className="h-4 w-4" />}
          accent="mana"
        />
        <StatCard
          label="Desafios resolvidos"
          value={`${stats.exercisesDone + stats.problemsDone}`}
          hint={`${stats.exercisesDone} locais · ${stats.problemsDone} externos`}
          icon={<Trophy className="h-4 w-4" />}
          accent="rune"
        />
      </section>

      {/* ---------- Main grid ---------- */}
      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* Continue */}
          <div className="panel relative overflow-hidden p-6">
            {continueTrack && (
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b opacity-70",
                  accentOf(continueTrack.accent).soft
                )}
              />
            )}
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow mb-2">Continuar de onde parou</p>
                {nextUp && continueTrack ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="chip">{continueTrack.title}</span>
                      <LevelBadge level={continueTrack.level} />
                    </div>
                    <h2 className="max-w-xl text-xl font-semibold leading-snug tracking-tight text-white">
                      {nextUp.title}
                    </h2>
                    <p className="mt-2 text-[12.5px] text-zinc-500">
                      {nextUp.moduleTitle} · {nextUp.minutes} min ·{" "}
                      {nextUp.status === "in_progress" ? "em andamento" : "próxima da fila"}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/trilhas/${nextUp.trackSlug}/aulas/${nextUp.slug}`}
                        className="btn-primary"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />{" "}
                        {nextUp.status === "in_progress" ? "Retomar aula" : "Começar aula"}
                      </Link>
                      <Link
                        href={`/trilhas/${continueTrack.slug}`}
                        className="btn-ghost text-[12px]"
                      >
                        Ver trilha <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold text-white">Tudo em dia. Hora de revisar.</h2>
                    <p className="mt-2 text-[13px] text-zinc-500">
                      Você concluiu todas as aulas disponíveis. Resolva desafios externos ou revisite
                      os pontos fracos na revisão espaçada.
                    </p>
                    <Link href="/desafios" className="btn-primary mt-4">
                      <Trophy className="h-4 w-4" /> Ir para desafios
                    </Link>
                  </>
                )}
              </div>
              {continueTrack && (
                <div className="hidden shrink-0 flex-col items-end sm:flex">
                  <span className="font-mono text-2xl font-semibold text-white">
                    {continueTrack.percent}%
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                    da trilha
                  </span>
                  <div className="mt-3 w-28">
                    <ProgressBar value={continueTrack.percent} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Heatmap */}
          <div className="panel p-6">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-1.5">Consistência</p>
                <h2 className="text-[17px] font-semibold tracking-tight text-white">
                  Sua atividade de estudo
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <StudyTimer />
              </div>
            </div>
            <Heatmap cells={heatmap} />
          </div>

          {/* Tracks */}
          <div>
            <SectionTitle
              label="Sua jornada"
              title={focusTracks.some((t) => t.lessonsDone > 0) ? "Trilhas em movimento" : "Por onde começar"}
              href="/trilhas"
              linkLabel="Ver as 12 trilhas"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {focusTracks.map((track) => {
                const a = accentOf(track.accent);
                return (
                  <Link
                    key={track.slug}
                    href={`/trilhas/${track.slug}`}
                    className="panel glass-hover group relative overflow-hidden p-5"
                  >
                    <div className={cn("absolute inset-x-0 top-0 h-20 bg-gradient-to-b opacity-50", a.soft)} />
                    <div className="relative flex items-start gap-3">
                      <span
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                          a.bg,
                          a.border,
                          a.text
                        )}
                      >
                        <TrackIcon icon={track.icon} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[14px] font-medium text-white group-hover:text-arcane-100">
                          {track.title}
                        </h3>
                        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-zinc-500">
                          {track.subtitle}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-700 transition-transform group-hover:translate-x-0.5 group-hover:text-arcane-300" />
                    </div>
                    <div className="relative mt-4 flex items-center gap-3">
                      <ProgressBar value={track.percent} gradient={a.gradient} className="flex-1" />
                      <span className="font-mono text-[10px] text-zinc-500">{track.percent}%</span>
                    </div>
                    <div className="relative mt-2 flex justify-between font-mono text-[9.5px] text-zinc-600">
                      <span>
                        {track.lessonsDone}/{track.lessonCount} aulas
                      </span>
                      <span>{track.estimatedHours}h</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          {/* Today */}
          <div className="panel overflow-hidden">
            <div className="border-b border-white/[0.06] p-5">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Plano de hoje</p>
                <span className="font-mono text-[10px] text-zinc-600">{todayKey()}</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-2xl font-semibold text-white">
                  {stats.todayMinutes}
                  <span className="ml-1 text-sm font-normal text-zinc-500">
                    / {profile.dailyGoalMinutes} min
                  </span>
                </p>
                <span className={cn("font-mono text-[11px]", goalPercent >= 100 ? "text-rune" : "text-arcane-300")}>
                  {goalPercent}%
                </span>
              </div>
              <div className="mt-2.5">
                <ProgressBar value={goalPercent} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[10.5px] text-zinc-600">
                  {goalPercent >= 100 ? "Meta batida. Excelente." : "Registre seu tempo ao terminar."}
                </p>
                <StudyTimer />
              </div>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {nextUp && (
                <Link
                  href={`/trilhas/${nextUp.trackSlug}/aulas/${nextUp.slug}`}
                  className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.025]"
                >
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-arcane-400/60" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-zinc-200 group-hover:text-white">
                      {nextUp.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
                      aula · {nextUp.minutes} min
                    </span>
                  </span>
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-zinc-700" />
                </Link>
              )}
              {plan.exercise && (
                <Link
                  href={`/exercicios/${plan.exercise.slug}`}
                  className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.025]"
                >
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-mana/60" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-zinc-200 group-hover:text-white">
                      {plan.exercise.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
                      exercício · {plan.exercise.difficulty} · {plan.exercise.minutes} min
                    </span>
                  </span>
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-zinc-700" />
                </Link>
              )}
              {plan.problem && (
                <a
                  href={plan.problem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.025]"
                >
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-rune/60" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-zinc-200 group-hover:text-white">
                      {plan.problem.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
                      {plan.problem.platform} · {plan.problem.difficulty}
                    </span>
                  </span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-zinc-700" />
                </a>
              )}
              {!nextUp && !plan.exercise && !plan.problem && (
                <div className="px-5 py-8 text-center">
                  <CheckCircle2 className="mx-auto h-5 w-5 text-rune" />
                  <p className="mt-2 text-[12px] text-zinc-500">Nada pendente. Aproveite para revisar.</p>
                </div>
              )}
            </div>
            <div className="border-t border-white/[0.06] px-5 py-2.5">
              <Link
                href="/exercicios"
                className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600 transition-colors hover:text-arcane-300"
              >
                abrir banco de exercícios →
              </Link>
            </div>
          </div>

          {/* Reviews */}
          <Link
            href="/revisao"
            className="panel glass-hover group block overflow-hidden p-5"
          >
            <div className="flex items-center justify-between">
              <p className="eyebrow">Memória de longo prazo</p>
              <RotateCcw className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-arcane-300" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-white">{stats.reviewsDue}</span>
              <span className="text-[12px] text-zinc-500">
                {stats.reviewsDue === 1 ? "item para revisar" : "itens para revisar"}
              </span>
            </div>
            {reviews.due.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {reviews.due.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-[11.5px] text-zinc-400">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-ember" />
                    <span className="truncate">{item.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-600">
                Conclua aulas e exercícios para alimentar sua fila de revisão espaçada.
              </p>
            )}
            <p className="mt-3 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
              {reviews.upcoming.length} agendados · abrir revisão →
            </p>
          </Link>

          {/* Activity */}
          <div className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Atividade recente</p>
              <Link href="/progresso" className="text-[10px] text-zinc-600 hover:text-arcane-300">
                tudo
              </Link>
            </div>
            {activity.length === 0 ? (
              <div className="py-5 text-center">
                <p className="text-[12px] text-zinc-500">Seu histórico aparece aqui.</p>
                <Link href="/trilhas" className="mt-2 inline-block text-[11px] text-arcane-300">
                  começar a estudar →
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {activity.map((item) => {
                  const Icon = activityIcons[item.kind] ?? Sparkles;
                  return (
                    <li key={item.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-white/[0.03] text-zinc-500">
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] text-zinc-300">{item.title}</p>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                          {item.detail ?? item.kind} · {relativeTime(item.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Daily reminder */}
          <div className="rounded-2xl border border-arcane-400/15 bg-gradient-to-br from-arcane-500/[0.09] to-transparent p-5">
            <p className="font-display text-[15px] italic leading-relaxed text-arcane-100/90">
              “O mago não nasce sabendo o feitiço. Ele erra, depura e conjura de novo.”
            </p>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-arcane-400/50">
              regra da casa · consistência &gt; intensidade
            </p>
          </div>
        </div>
      </section>

      {stats.lessonsTotal === 0 && (
        <div className="panel p-6 text-center">
          <p className="text-sm text-zinc-400">
            Conteúdo ainda não carregado. Rode <code className="text-arcane-300">npm run seed</code> para
            popular as trilhas.
          </p>
        </div>
      )}
    </div>
  );
}
