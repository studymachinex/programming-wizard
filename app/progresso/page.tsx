import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Code2,
  Download,
  Flame,
  FolderKanban,
  NotebookPen,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getGlobalStats, getHeatmap, getRecentActivity, getReviewQueue, getTrackSummaries, PROFILE_ID } from "@/lib/data";
import { cn, difficultyLabel, difficultyStyles, formatDate, formatMinutes, pct, relativeTime, todayKey } from "@/lib/utils";
import { Heatmap } from "@/components/heatmap";
import { ProgressRing } from "@/components/progress-ring";
import { PageHeader, ProgressBar, StatCard, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

function weekStart(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return todayKey(d);
}

export default async function ProgressPage() {
  const [stats, tracks, heatmap, activity, reviews, exercises, problems, sessions, bookmarks, notes] =
    await Promise.all([
      getGlobalStats(),
      getTrackSummaries(),
      getHeatmap(24),
      getRecentActivity(12),
      getReviewQueue(),
      prisma.exercise.findMany({
        select: {
          difficulty: true,
          progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
        },
      }),
      prisma.externalProblem.findMany({
        select: {
          platform: true,
          level: true,
          progress: { where: { profileId: PROFILE_ID }, select: { status: true } },
        },
      }),
      prisma.studySession.findMany({
        where: { profileId: PROFILE_ID, minutes: { gt: 0 } },
        orderBy: { day: "asc" },
      }),
      prisma.lessonProgress.findMany({
        where: { profileId: PROFILE_ID, bookmarked: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { lesson: { include: { module: { include: { track: true } } } } },
      }),
      prisma.lessonProgress.findMany({
        where: { profileId: PROFILE_ID, notes: { not: "" } },
        orderBy: { updatedAt: "desc" },
        take: 4,
        include: { lesson: { include: { module: { include: { track: true } } } } },
      }),
    ]);

  const overall = pct(stats.lessonsDone, stats.lessonsTotal);
  const totalSolved = stats.exercisesDone + stats.problemsDone + stats.projectsDone;

  const weekMap = new Map<string, number>();
  for (const s of sessions) weekMap.set(weekStart(s.day), (weekMap.get(weekStart(s.day)) ?? 0) + s.minutes);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const key = weekStart(todayKey(d));
    weeks.push({ key, minutes: weekMap.get(key) ?? 0 });
  }
  const maxWeek = Math.max(...weeks.map((w) => w.minutes), 1);

  const diffRows = ["facil", "medio", "dificil", "especialista"].map((d) => {
    const items = exercises.filter((e) => e.difficulty === d);
    return {
      key: d,
      total: items.length,
      solved: items.filter((e) => e.progress[0]?.status === "solved").length,
    };
  });

  const platforms = [...new Set(problems.map((p) => p.platform))].map((platform) => {
    const items = problems.filter((p) => p.platform === platform);
    return {
      platform,
      total: items.length,
      solved: items.filter((p) => p.progress[0]?.status === "solved").length,
    };
  });

  const achievements = [
    { id: "first", icon: Sparkles, title: "Primeiro feitiço", desc: "Concluir a primeira aula", done: stats.lessonsDone >= 1 },
    { id: "streak7", icon: Flame, title: "Chama constante", desc: "7 dias seguidos", done: stats.streak >= 7 },
    { id: "lessons25", icon: BookOpen, title: "Aprendiz dedicado", desc: "25 aulas concluídas", done: stats.lessonsDone >= 25 },
    { id: "code10", icon: Code2, title: "Mãos na massa", desc: "10 exercícios resolvidos", done: stats.exercisesDone >= 10 },
    { id: "problems25", icon: Trophy, title: "Caçador de padrões", desc: "25 desafios externos", done: stats.problemsDone >= 25 },
    { id: "hours50", icon: Zap, title: "50 horas de foco", desc: "Tempo total de estudo", done: stats.minutes >= 3000 },
    { id: "project1", icon: FolderKanban, title: "Construtor", desc: "1 projeto concluído", done: stats.projectsDone >= 1 },
    { id: "review", icon: RotateCcw, title: "Memória de aço", desc: "50 revisões feitas", done: false },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Telemetria da jornada"
        title={
          <>
            Você está <span className="font-display italic text-arcane-200">{overall}%</span> do caminho.
          </>
        }
        description="Progresso não é vaidade: é o mapa do que você já domina e do que ainda precisa de repetição. Olhe os números, encontre o gargalo e ajuste o plano."
        actions={
          <>
            <a href="/api/export" download className="btn-secondary">
              <Download className="h-4 w-4" /> Exportar progresso
            </a>
            <Link href="/revisao" className="btn-primary">
              <RotateCcw className="h-4 w-4" /> Revisar ({stats.reviewsDue})
            </Link>
          </>
        }
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Aulas" value={`${stats.lessonsDone}/${stats.lessonsTotal}`} hint={`${overall}% da trilha total`} icon={<BookOpen className="h-4 w-4" />} accent="mana" />
        <StatCard label="Desafios resolvidos" value={totalSolved} hint={`${stats.exercisesDone} locais · ${stats.problemsDone} externos`} icon={<Trophy className="h-4 w-4" />} accent="rune" />
        <StatCard label="Tempo de estudo" value={formatMinutes(stats.minutes)} hint={`${stats.todayMinutes} min hoje`} icon={<Zap className="h-4 w-4" />} accent="arcane" />
        <StatCard label="Sequência" value={`${stats.streak} dias`} hint={`${reviews.due.length} revisões vencidas`} icon={<Flame className="h-4 w-4" />} accent="ember" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Track progress */}
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <p className="eyebrow mb-1">Domínio por trilha</p>
                <h2 className="text-[15px] font-semibold text-white">Onde você está</h2>
              </div>
              <Link href="/trilhas" className="text-[11px] text-zinc-600 hover:text-arcane-300">
                abrir currículo →
              </Link>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {tracks.map((track) => {
                const a = accentOf(track.accent);
                return (
                  <Link
                    key={track.slug}
                    href={`/trilhas/${track.slug}`}
                    className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", a.bg, a.border, a.text)}>
                      <TrackIcon icon={track.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[12px] font-medium text-zinc-200 group-hover:text-white">
                          {track.title}
                        </p>
                        <span className="shrink-0 font-mono text-[9.5px] text-zinc-500">{track.percent}%</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <ProgressBar value={track.percent} gradient={a.gradient} className="h-1 flex-1" />
                        <span className="hidden shrink-0 font-mono text-[8.5px] text-zinc-600 sm:block">
                          {track.lessonsDone}/{track.lessonCount} aulas · {track.exercisesDone}/{track.exerciseCount} ex
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Heatmap */}
          <div className="panel p-5">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="eyebrow mb-1">Constância</p>
                <h2 className="text-[15px] font-semibold text-white">Últimas 24 semanas</h2>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                {stats.streak} dias de sequência
              </span>
            </div>
            <Heatmap cells={heatmap} />
          </div>

          {/* Weekly bars */}
          <div className="panel p-5">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="eyebrow mb-1">Ritmo</p>
                <h2 className="text-[15px] font-semibold text-white">Minutos por semana</h2>
              </div>
              <span className="font-mono text-[9px] text-zinc-600">8 semanas</span>
            </div>
            <div className="flex h-36 items-end gap-3">
              {weeks.map((week) => (
                <div key={week.key} className="group flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-arcane-600/40 to-arcane-400 transition-all group-hover:from-arcane-500/60 group-hover:to-mana"
                      style={{ height: `${Math.max(3, (week.minutes / maxWeek) * 100)}%` }}
                    />
                    <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 font-mono text-[8.5px] text-zinc-400 group-hover:block">
                      {week.minutes}m
                    </span>
                  </div>
                  <span className="font-mono text-[8px] text-zinc-600">{formatDate(week.key)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Achievements */}
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="eyebrow mb-1">Conquistas</p>
                <h2 className="text-[15px] font-semibold text-white">Marcos da jornada</h2>
              </div>
              <span className="font-mono text-[9px] text-zinc-600">
                {achievements.filter((a) => a.done).length}/{achievements.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {achievements.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    item.done
                      ? "border-arcane-400/20 bg-arcane-500/[0.06]"
                      : "border-white/[0.05] bg-white/[0.015] opacity-45"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", item.done ? "text-arcane-300" : "text-zinc-600")} />
                  <p className="mt-2 text-[10.5px] font-medium text-zinc-200">{item.title}</p>
                  <p className="mt-0.5 font-mono text-[8px] text-zinc-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {notes.length > 0 && (
            <div className="panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-arcane-300" />
                  <h2 className="text-[14px] font-semibold text-white">Seus grimórios</h2>
                </div>
                <span className="font-mono text-[9px] text-zinc-600">últimas notas</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {notes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/trilhas/${note.lesson.module.track.slug}/aulas/${note.lesson.slug}`}
                    className="group rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-arcane-400/20"
                  >
                    <p className="truncate text-[11px] font-medium text-zinc-300 group-hover:text-white">
                      {note.lesson.title}
                    </p>
                    <p className="mt-1 line-clamp-3 text-[10.5px] leading-relaxed text-zinc-600">{note.notes}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <div className="panel relative flex flex-col items-center overflow-hidden p-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,0.14),transparent_70%)]" />
            <p className="eyebrow relative self-start">visão geral</p>
            <div className="relative mt-3">
              <ProgressRing value={overall} size={150} stroke={9}>
                <div>
                  <p className="text-3xl font-semibold text-white">{overall}%</p>
                  <p className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-500">do currículo</p>
                </div>
              </ProgressRing>
            </div>
            <div className="relative mt-3 grid w-full grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06] pt-3 text-center">
              <div>
                <p className="text-sm font-semibold text-white">{stats.lessonsDone}</p>
                <p className="font-mono text-[8px] text-zinc-600">aulas</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{stats.exercisesDone}</p>
                <p className="font-mono text-[8px] text-zinc-600">exercícios</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{stats.problemsDone}</p>
                <p className="font-mono text-[8px] text-zinc-600">desafios</p>
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <p className="eyebrow mb-3">Exercícios locais</p>
            <div className="space-y-3">
              {diffRows.map((row) => (
                <div key={row.key}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase", difficultyStyles[row.key])}>
                      {difficultyLabel(row.key)}
                    </span>
                    <span className="font-mono text-[8.5px] text-zinc-600">{row.solved}/{row.total}</span>
                  </div>
                  <ProgressBar value={pct(row.solved, row.total)} className="h-1" />
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <p className="eyebrow mb-3">Desafios externos</p>
            <div className="space-y-3">
              {platforms.map((row) => (
                <div key={row.platform}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10.5px] text-zinc-400">{row.platform}</span>
                    <span className="font-mono text-[8.5px] text-zinc-600">{row.solved}/{row.total}</span>
                  </div>
                  <ProgressBar value={pct(row.solved, row.total)} className="h-1" />
                </div>
              ))}
              {platforms.length === 0 && <p className="text-[11px] text-zinc-600">Nenhum desafio carregado.</p>}
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <p className="eyebrow">Favoritos</p>
              <Bookmark className="h-3.5 w-3.5 text-zinc-600" />
            </div>
            {bookmarks.length === 0 ? (
              <p className="px-4 py-5 text-[11px] leading-relaxed text-zinc-600">
                Salve aulas com o ícone de marcador para montar sua lista de revisão.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {bookmarks.map((b) => (
                  <Link
                    key={b.id}
                    href={`/trilhas/${b.lesson.module.track.slug}/aulas/${b.lesson.slug}`}
                    className="block px-4 py-2.5 hover:bg-white/[0.02]"
                  >
                    <p className="truncate text-[11px] text-zinc-300">{b.lesson.title}</p>
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                      {b.lesson.module.track.title}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-5">
            <p className="eyebrow mb-3">Atividade recente</p>
            {activity.length === 0 ? (
              <p className="text-[11px] text-zinc-600">Ainda sem atividade registrada.</p>
            ) : (
              <ul className="space-y-2.5">
                {activity.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-zinc-700" />
                    <div className="min-w-0">
                      <p className="truncate text-[10.5px] text-zinc-400">{item.title}</p>
                      <p className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                        {relativeTime(item.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-ember/15 bg-ember/[0.04] p-4">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-ember/80" />
              <p className="text-[11.5px] font-medium text-ember/90">Próximo marco</p>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-500">
              {stats.lessonsDone < 25
                ? `Faltam ${25 - stats.lessonsDone} aulas para “Aprendiz dedicado”.`
                : stats.exercisesDone < 10
                  ? `Faltam ${10 - stats.exercisesDone} exercícios para “Mãos na massa”.`
                  : stats.problemsDone < 25
                    ? `Faltam ${25 - stats.problemsDone} desafios para “Caçador de padrões”.`
                    : "Você está no nível de consistência de quem passa em FAANG. Mantenha."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
