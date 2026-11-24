import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  FolderKanban,
  Layers,
  Lock,
  Play,
  Sparkles,
  Terminal,
  Trophy,
} from "lucide-react";
import { getProjectCatalog } from "@/lib/data";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader, ProgressBar, accentOf } from "@/components/ui";
import {
  getCodecraftersOverview,
  progressPercent,
  statusLabel as challengeStatusLabel,
} from "@/lib/codecrafters";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  done: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  in_progress: "border-arcane-400/25 bg-arcane-500/10 text-arcane-200",
  todo: "border-white/[0.08] bg-white/[0.02] text-zinc-500",
};

const statusLabels: Record<string, string> = {
  done: "concluído",
  in_progress: "em andamento",
  todo: "não iniciado",
};

const challengeStyles: Record<string, string> = {
  done: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  in_progress: "border-arcane-400/25 bg-arcane-500/10 text-arcane-200",
  available: "border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300",
  planned: "border-white/[0.07] bg-white/[0.02] text-zinc-600",
};

export default async function ProjectsPage() {
  const [projects, codecrafters] = await Promise.all([
    getProjectCatalog(),
    Promise.resolve(getCodecraftersOverview()),
  ]);
  const done = projects.filter((p) => p.progress[0]?.status === "done").length;
  const inProgress = projects.filter((p) => p.progress[0]?.status === "in_progress").length;
  const hours = projects.reduce((s, p) => s + p.estimatedHours, 0);
  const playable = codecrafters.cards.filter((card) => card.available);
  const next =
    playable.find((card) => card.completed > 0 && card.completed < card.stageCount) ??
    playable.find((card) => card.completed < card.stageCount) ??
    playable[0];
  const nextName = next?.title.replace(/^Build your own /, "");

  return (
    <div>
      <PageHeader
        eyebrow="Portfólio"
        title={
          <>
            Projetos que provam que você <span className="font-display italic text-arcane-200">sabe fazer</span>.
          </>
        }
        description="Dois formatos de prática: desafios Build your own X no estilo CodeCrafters, com runner e hook de submissão, e capstones de engenharia com requisitos de arquitetura, testes e operação."
        actions={
          <div className="panel flex items-center gap-4 px-4 py-2.5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">stages</p>
              <p className="mt-0.5 text-sm font-medium text-white">
                {codecrafters.completedStages}{" "}
                <span className="text-zinc-500">/ {codecrafters.totalStages}</span>
              </p>
            </div>
            <div className="h-8 w-px bg-white/[0.07]" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">capstones</p>
              <p className="mt-0.5 text-sm font-medium text-white">
                {done} <span className="text-zinc-500">/ {projects.length}</span>
              </p>
            </div>
          </div>
        }
      />

      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Terminal, label: "desafios CodeCrafters", value: codecrafters.totalChallenges },
          { icon: Code2, label: "stages mapeados", value: codecrafters.totalStages },
          { icon: Sparkles, label: "em andamento", value: codecrafters.inProgress },
          { icon: Trophy, label: "desafios concluídos", value: codecrafters.completedChallenges },
        ].map((item) => (
          <div key={item.label} className="panel flex items-center gap-3 p-4">
            <item.icon className="h-4 w-4 text-zinc-600" />
            <div>
              <p className="text-base font-semibold leading-none text-white">{item.value}</p>
              <p className="mt-1 font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      <section id="codecrafters" className="mb-10 scroll-mt-24">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-1.5">CodeCrafters · build your own X</p>
            <h2 className="text-[17px] font-semibold tracking-tight text-white">
              Implemente a ferramenta. Entenda o protocolo.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
              425 stages mapeados do catálogo público. Cada desafio tem starter repo, instruções,
              runner e um remote git cujo hook roda os testes no push. Jogáveis de ponta a ponta:{" "}
              {playable.map((card) => card.title.replace(/^Build your own /, "")).join(", ")}.
            </p>
          </div>
          {next && (
            <Link
              href={next.href}
              className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-arcane-300/80 transition-colors hover:text-arcane-200"
            >
              {next.completed >= next.stageCount
                ? "rever desafio"
                : next.completed > 0
                  ? `continuar ${nextName}`
                  : `começar ${nextName}`}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {codecrafters.cards.map((card) => {
            const percent = progressPercent(card.completed, card.stageCount);
            const isPlayable = card.available;
            const content = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-lg border",
                        card.status === "done"
                          ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
                          : card.status === "in_progress"
                            ? "border-arcane-400/20 bg-arcane-500/[0.08] text-arcane-300"
                            : card.available
                              ? "border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300"
                              : "border-white/[0.06] bg-white/[0.02] text-zinc-600"
                      )}
                    >
                      {card.status === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : card.status === "in_progress" ? (
                        <Play className="h-3 w-3" />
                      ) : card.available ? (
                        <Terminal className="h-3.5 w-3.5" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                        challengeStyles[card.status]
                      )}
                    >
                      {challengeStatusLabel(card.status)}
                    </span>
                  </div>
                  <span className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-700">
                    {card.stageCount} stages
                  </span>
                </div>

                <h3
                  className={cn(
                    "mt-3 text-[13px] font-semibold leading-snug",
                    isPlayable ? "text-white" : "text-zinc-400"
                  )}
                >
                  {card.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-zinc-600">
                  {card.description}
                </p>

                {card.available ? (
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between font-mono text-[8.5px] text-zinc-600">
                      <span>
                        {card.completed}/{card.stageCount}
                      </span>
                      <span>{percent}%</span>
                    </div>
                    <ProgressBar value={percent} />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {["starter repo", "instruções", "runner"].map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-white/[0.05] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[8px] text-zinc-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5 font-mono text-[8.5px] text-zinc-600">
                  <span className="flex items-center gap-1">
                    {card.language ? (
                      <>
                        <Code2 className="h-3 w-3" /> {card.language}
                      </>
                    ) : (
                      <>
                        <Layers className="h-3 w-3" /> catálogo
                      </>
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1",
                      isPlayable ? "text-arcane-300/70" : "text-zinc-700"
                    )}
                  >
                    {isPlayable ? (
                      <>
                        abrir desafio <ChevronRight className="h-3 w-3" />
                      </>
                    ) : (
                      "em breve"
                    )}
                  </span>
                </div>
              </>
            );

            return isPlayable ? (
              <Link
                key={card.slug}
                href={card.href}
                className="panel glass-hover group relative flex flex-col overflow-hidden p-4"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-arcane-500/[0.07] to-transparent opacity-70" />
                <div className="relative flex flex-1 flex-col">{content}</div>
              </Link>
            ) : (
              <div
                key={card.slug}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.04] bg-ink-850/40 p-4"
              >
                {content}
              </div>
            );
          })}
        </div>
      </section>

      <div className="mb-4 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-7">
        <div>
          <p className="eyebrow mb-1.5">Capstones</p>
          <h2 className="text-[17px] font-semibold tracking-tight text-white">
            Projetos de engenharia de ponta a ponta
          </h2>
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          <span className="flex items-center gap-1">
            <FolderKanban className="h-3 w-3" /> {projects.length}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" /> {hours}h
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Sparkles className="h-3 w-3" /> {inProgress} em andamento
          </span>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title="Projetos ainda não carregados"
          description="Rode npm run seed para popular os capstones."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project, i) => {
            const progress = project.progress[0];
            const status = progress?.status ?? "todo";
            const accent = accentOf(["arcane", "mana", "rune", "ember", "rose"][i % 5]);
            return (
              <Link
                key={project.id}
                href={`/projetos/${project.slug}`}
                className="panel glass-hover group relative flex flex-col overflow-hidden p-5"
              >
                <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-40", accent.soft)} />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider", statusStyles[status])}>
                      {statusLabels[status]}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                    {project.estimatedHours}h · {project.level}
                  </span>
                </div>

                <h3 className="relative mt-3 text-[15px] font-semibold text-white group-hover:text-arcane-100">
                  {project.title}
                </h3>
                <p className="relative mt-1.5 line-clamp-3 text-[11.5px] leading-relaxed text-zinc-500">
                  {project.description}
                </p>

                <div className="relative mt-3 flex flex-wrap gap-1.5">
                  {project.stack.slice(0, 6).map((tech) => (
                    <span key={tech} className="rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[8.5px] text-zinc-500">
                      {tech}
                    </span>
                  ))}
                </div>

                <div className="relative mt-auto flex items-center justify-between border-t border-white/[0.05] pt-3 text-[10px] text-zinc-600">
                  <span className="flex items-center gap-3 font-mono text-[9px]">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {project.requirements.length} requisitos
                    </span>
                    <span className="hidden items-center gap-1 sm:flex">
                      <Clock className="h-3 w-3" /> {project.estimatedHours}h
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-arcane-300/70 transition-colors group-hover:text-arcane-200">
                    abrir projeto <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
                {status !== "todo" && (
                  <div className="relative mt-2">
                    <ProgressBar value={status === "done" ? 100 : 40} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Terminal className="h-3.5 w-3.5 text-arcane-300/60" />
          Catálogo completo e roadmap em{" "}
          <code className="font-mono text-[10px] text-zinc-400">docs/codecrafters/ROADMAP.md</code>
        </p>
        <span className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-700">
          {codecrafters.available} de {codecrafters.totalChallenges} jogáveis
        </span>
      </div>
    </div>
  );
}
