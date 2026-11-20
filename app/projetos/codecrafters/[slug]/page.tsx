import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Code2,
  GitBranch,
  Layers,
  Lock,
  Play,
  Rocket,
  Terminal,
  Trophy,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { ChallengeRunner } from "@/components/challenge-runner";
import { Breadcrumb, ProgressBar } from "@/components/ui";
import {
  getChallengeMeta,
  getChallengeState,
  getCodecraftersOverview,
  getCourse,
  getSelectedStage,
  getStageInstructions,
  getWorkspaceInfo,
  progressPercent,
  statusLabel,
} from "@/lib/codecrafters";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const challenge = getChallengeMeta(slug);
  return { title: challenge?.title ?? "CodeCrafters" };
}

function StageList({
  course,
  state,
}: {
  course: NonNullable<ReturnType<typeof getCourse>>;
  state: ReturnType<typeof getChallengeState>;
}) {
  const groups = new Map<string, typeof course.stages>();
  for (const stage of course.stages) {
    const list = groups.get(stage.section) ?? [];
    list.push(stage);
    groups.set(stage.section, list);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([section, stages]) => (
        <div key={section}>
          <p className="mb-1.5 px-2 font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
            {section}
          </p>
          <div className="space-y-0.5">
            {stages.map((stage) => {
              const done = state.completed.includes(stage.order);
              const current = stage.order === state.currentStage;
              return (
                <Link
                  key={stage.id}
                  href={`?stage=${stage.id}`}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11.5px] transition-colors",
                    current
                      ? "border-arcane-400/20 bg-arcane-500/[0.09] text-arcane-100"
                      : done
                        ? "border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
                        : "border-transparent text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : current ? (
                    <Play className="h-3 w-3 shrink-0 text-arcane-300" />
                  ) : (
                    <Circle className="h-3 w-3 shrink-0 text-zinc-700" />
                  )}
                  <span className="font-mono text-[9px] text-zinc-600">
                    {String(stage.order).padStart(2, "0")}
                  </span>
                  <span className="truncate">{stage.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommandLine({ children }: { children: React.ReactNode }) {
  return (
    <code className="block rounded-md border border-white/[0.06] bg-black/30 px-2.5 py-1.5 font-mono text-[9.5px] leading-relaxed text-zinc-400">
      <span className="mr-1.5 text-arcane-400/70">$</span>
      {children}
    </code>
  );
}

export default async function CodeChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const challenge = getChallengeMeta(slug);
  if (!challenge) notFound();

  const course = getCourse(slug);
  const state = getChallengeState(slug);

  if (!course) {
    const playable = getCodecraftersOverview().cards.filter((card) => card.available);
    const suggestion = playable.find((card) => card.completed < card.stageCount) ?? playable[0];
    return (
      <div>
        <Breadcrumb
          items={[
            { label: "Projetos", href: "/projetos" },
            { label: "CodeCrafters", href: "/projetos#codecrafters" },
            { label: challenge.title },
          ]}
        />
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-850/75 p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-arcane-500/[0.08] via-transparent to-mana/[0.03]" />
          <div className="relative">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-500">
                <Lock className="h-4 w-4" />
              </span>
              <span className="chip">CodeCrafters</span>
              <span className="chip text-zinc-500">em breve na plataforma</span>
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[2.5rem]">
              {challenge.title}
            </h1>
            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-zinc-400">
              {challenge.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3 w-3" /> {challenge.stageCount} stages
              </span>
              <span className="flex items-center gap-1.5">
                <Trophy className="h-3 w-3" /> {challenge.access}
              </span>
              <a
                href={challenge.catalogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-arcane-300/70 hover:text-arcane-200"
              >
                catálogo original <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="panel p-6">
            <h2 className="text-[13px] font-medium text-white">Stages do desafio</h2>
            <p className="mt-1 text-[11.5px] text-zinc-500">
              O conteúdo e o runner local são adicionados na ordem do roadmap, do desafio com menos
              stages para o com mais. Já jogáveis: {playable.map((card) => card.title.replace(/^Build your own /, "")).join(", ")}.
            </p>
            <div className="mt-4 space-y-1">
              {challenge.stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-2.5 rounded-lg border border-white/[0.04] px-3 py-2 text-[11.5px] text-zinc-500"
                >
                  <Lock className="h-3 w-3 text-zinc-700" />
                  <span className="font-mono text-[9px] text-zinc-700">
                    {String(stage.order).padStart(2, "0")}
                  </span>
                  <span>{stage.title}</span>
                  <span className="ml-auto font-mono text-[8.5px] uppercase tracking-wider text-zinc-700">
                    {stage.difficulty}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            {suggestion && (
              <div className="panel p-5">
                <p className="eyebrow mb-3">Enquanto isso</p>
                <p className="text-[12px] leading-relaxed text-zinc-400">
                  <strong className="text-white">{suggestion.title}</strong> já está jogável de ponta a
                  ponta, com starter, instruções e runner local.
                </p>
                <Link href={suggestion.href} className="btn-primary mt-4 w-full py-2 text-[12px]">
                  <Terminal className="h-3.5 w-3.5" /> Abrir {suggestion.title.replace(/^Build your own /, "")}
                </Link>
              </div>
            )}
            <Link
              href="/projetos#codecrafters"
              className="flex items-center gap-2 px-1 text-[11.5px] text-zinc-500 hover:text-arcane-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para Projetos
            </Link>
          </aside>
        </div>
      </div>
    );
  }

  const stage = getSelectedStage(course, state, query.stage);
  const instructions = getStageInstructions(slug, course, stage);
  const workspace = getWorkspaceInfo(slug, course);
  const completed = state.completed.length;
  const percent = progressPercent(completed, course.stages.length);
  const index = course.stages.findIndex((item) => item.id === stage.id);
  const previous = course.stages[index - 1];
  const next = course.stages[index + 1];
  const stageDone = state.completed.includes(stage.order);
  const isCurrent = stage.order === state.currentStage;
  const overview = getCodecraftersOverview();
  const external = overview.cards.find((card) => card.slug === slug);
  const lastRun =
    [state.lastRun, state.lastTest]
      .filter((run): run is NonNullable<typeof run> => Boolean(run))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0] ?? null;
  const attemptedStage = lastRun?.attemptedStage ?? state.currentStage;
  const attemptedResult = lastRun?.results.find((result) => result.number === attemptedStage);
  const attemptedPassed = Boolean(lastRun && !lastRun.compileFailed && attemptedResult?.ok);

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Projetos", href: "/projetos" },
          { label: "CodeCrafters", href: "/projetos#codecrafters" },
          { label: challenge.title, href: `/projetos/codecrafters/${slug}` },
          { label: `Stage ${stage.order}` },
        ]}
      />

      <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-850/75 p-6 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-arcane-500/[0.10] via-transparent to-mana/[0.04]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-arcane-400/20 bg-arcane-500/10 text-arcane-300">
                <Terminal className="h-4 w-4" />
              </span>
              <span className="chip border-arcane-400/20 bg-arcane-500/[0.08] text-arcane-200">
                CodeCrafters
              </span>
              <span className="chip">{course.languageLabel}</span>
              <span className="chip">
                {completed}/{course.stages.length} stages
              </span>
              {external?.status === "done" && (
                <span className="chip border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> concluído
                </span>
              )}
            </div>
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[2.3rem]">
              {course.title}
            </h1>
            <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-zinc-400">
              {course.tagline}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> ~{course.estimatedHours}h
              </span>
              <span className="flex items-center gap-1.5">
                <Code2 className="h-3 w-3" /> {course.stages.length} stages
              </span>
              <span className="flex items-center gap-1.5">
                <GitBranch className="h-3 w-3" /> git push = testes
              </span>
              <span className="flex items-center gap-1.5">
                <Layers className="h-3 w-3" /> {course.topics.slice(0, 3).join(" · ")}
              </span>
            </div>
          </div>

          <div className="w-full max-w-[260px] lg:w-[240px]">
            <div className="flex items-end justify-between">
              <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">progresso</p>
              <p className="text-2xl font-semibold leading-none text-white">{percent}%</p>
            </div>
            <ProgressBar value={percent} className="mt-2" />
            <p className="mt-2 font-mono text-[9px] text-zinc-600">
              {completed} de {course.stages.length} stages concluídos
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[218px_minmax(0,1fr)_286px]">
        <aside className="order-2 lg:order-1">
          <div className="panel sticky top-24 max-h-[calc(100vh-8rem)] overflow-auto p-2.5">
            <div className="mb-2 flex items-center justify-between px-2 py-1">
              <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
                stages
              </p>
              <span className="font-mono text-[8.5px] text-zinc-700">
                {completed}/{course.stages.length}
              </span>
            </div>
            <StageList course={course} state={state} />
          </div>
        </aside>

        <main className="order-1 min-w-0 lg:order-2">
          <article className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3 sm:px-7">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-arcane-300/80">
                stage {String(stage.order).padStart(2, "0")}
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                {stage.difficulty}
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                {stage.section}
              </span>
              <span
                className={cn(
                  "ml-auto rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider",
                  stageDone
                    ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
                    : isCurrent
                      ? "border-arcane-400/25 bg-arcane-500/10 text-arcane-200"
                      : "border-white/[0.07] bg-white/[0.02] text-zinc-600"
                )}
              >
                {stageDone ? "concluído" : isCurrent ? "stage atual" : "não iniciado"}
              </span>
            </div>

            <div className="px-5 py-6 sm:px-7 sm:py-7">
              <h2 className="text-[1.7rem] font-semibold tracking-[-0.02em] text-white">
                {stage.title}
              </h2>
              <p className="mt-1.5 text-[12px] text-zinc-500">{stage.summary}</p>
              <div className="mt-6">
                <Markdown content={instructions} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4 sm:px-7">
              {previous ? (
                <Link
                  href={`?stage=${previous.id}`}
                  className="flex items-center gap-1.5 text-[11.5px] text-zinc-500 transition-colors hover:text-arcane-300"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> {previous.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  href={`?stage=${next.id}`}
                  className="flex items-center gap-1.5 text-right text-[11.5px] text-zinc-500 transition-colors hover:text-arcane-300"
                >
                  {next.title} <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Link
                  href="/projetos#codecrafters"
                  className="flex items-center gap-1.5 text-[11.5px] text-zinc-500 transition-colors hover:text-arcane-300"
                >
                  voltar ao catálogo <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </article>
        </main>

        <aside className="order-3 space-y-4">
          <ChallengeRunner
            slug={slug}
            hasWorkspace={workspace.exists}
            completed={completed}
            total={course.stages.length}
          />

          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Workspace</p>
              <span
                className={cn(
                  "font-mono text-[8.5px] uppercase tracking-wider",
                  workspace.exists ? "text-emerald-400" : "text-zinc-600"
                )}
              >
                {workspace.exists ? "pronto" : "não criado"}
              </span>
            </div>
            <p className="mt-2 break-all font-mono text-[9.5px] leading-relaxed text-zinc-500">
              {workspace.relativeDirectory ?? `challenges/.workspaces/${slug}-${course.language}`}
            </p>
            <div className="mt-3 space-y-1.5">
              <CommandLine>npm run cc -- task</CommandLine>
              <CommandLine>npm run cc -- test</CommandLine>
              <CommandLine>npm run cc -- submit</CommandLine>
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-zinc-600">
              O <code className="text-zinc-400">submit</code> commita, empurra para o remote local{" "}
              <code className="text-zinc-400">wizard</code> e o hook{" "}
              <code className="text-zinc-400">post-receive</code> compila e roda os testes — igual ao
              CodeCrafters.
            </p>
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Última execução</p>
              <Rocket className="h-3.5 w-3.5 text-zinc-700" />
            </div>
            {lastRun ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider",
                      attemptedPassed
                        ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
                        : "border-rose-400/20 bg-rose-400/[0.07] text-rose-300"
                    )}
                  >
                    {lastRun.compileFailed
                      ? "compile failed"
                      : attemptedPassed
                        ? `stage ${attemptedStage} passou`
                        : `stage ${attemptedStage} falhou`}
                  </span>
                  <span className="font-mono text-[8.5px] text-zinc-600">
                    {lastRun.passed.length}/{course.stages.length} stages
                  </span>
                </div>
                <p className="font-mono text-[9px] text-zinc-600">
                  {new Date(lastRun.at).toLocaleString("pt-BR")}
                  {lastRun.commit ? ` · ${lastRun.commit.slice(0, 7)}` : ""}
                </p>
                <p className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-700">
                  {lastRun.kind === "submit" ? "submissão · avança o stage" : "teste local · não avança"}
                </p>
                <details className="group">
                  <summary className="cursor-pointer list-none font-mono text-[9px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400">
                    ver log do runner
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.05] bg-black/30 p-2.5 font-mono text-[9px] leading-relaxed text-zinc-500">
                    {lastRun.output || "sem saída registrada"}
                  </pre>
                </details>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                Nenhuma execução ainda.{" "}
                {workspace.exists
                  ? `Implemente o stage ${state.currentStage} e clique em `
                  : "Crie o workspace, implemente o stage 1 e clique em "}
                <strong className="text-zinc-400">Submeter stage</strong>.
              </p>
            )}
          </div>

          <div className="panel p-5">
            <p className="eyebrow mb-2">Próximo marco</p>
            {completed >= course.stages.length ? (
              <p className="flex items-center gap-2 text-[11.5px] text-emerald-300">
                <Trophy className="h-3.5 w-3.5" /> Desafio concluído
              </p>
            ) : (
              <Link
                href={`?stage=${course.stages.find((item) => item.order === state.currentStage)?.id ?? stage.id}`}
                className="flex items-center gap-2 text-[11.5px] text-zinc-400 hover:text-arcane-300"
              >
                <Play className="h-3 w-3 text-arcane-300" />
                Stage {state.currentStage} ·{" "}
                {course.stages.find((item) => item.order === state.currentStage)?.title ?? "continuar"}
              </Link>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
              {statusLabel(external?.status ?? "available")} · {completed} de {course.stages.length} concluídos.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
