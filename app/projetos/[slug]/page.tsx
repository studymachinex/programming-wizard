import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FolderKanban,
  GitBranch,
  Layers,
  ListChecks,
  Rocket,
  Sparkles,
} from "lucide-react";
import { getProjectDetail } from "@/lib/data";
import { cn } from "@/lib/utils";
import { ProjectForm } from "@/components/project-form";
import { Breadcrumb, LevelBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectDetail(slug);
  return { title: project?.title ?? "Projeto" };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectDetail(slug);
  if (!project) notFound();
  const progress = project.progress[0];

  return (
    <div>
      <Breadcrumb items={[{ label: "Projetos", href: "/projetos" }, { label: project.title }]} />

      <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-850/75 p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-arcane-500/[0.09] via-transparent to-mana/[0.04]" />
        <div className="relative">
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-arcane-400/20 bg-arcane-500/10 text-arcane-300">
              <FolderKanban className="h-5 w-5" />
            </span>
            <LevelBadge level={project.level} />
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
              <Clock className="h-3 w-3" /> {project.estimatedHours}h estimadas
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
              <ListChecks className="h-3 w-3" /> {project.requirements.length} requisitos
            </span>
            {project.track && (
              <Link
                href={`/trilhas/${project.track.slug}`}
                className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-arcane-300/70 hover:text-arcane-200"
              >
                <Layers className="h-3 w-3" /> {project.track.title}
              </Link>
            )}
          </div>

          <h1 className="max-w-3xl text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[2.5rem]">
            {project.title}
          </h1>
          <p className="mt-4 max-w-3xl text-[13.5px] leading-relaxed text-zinc-400">{project.description}</p>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {project.stack.map((tech) => (
              <span key={tech} className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 font-mono text-[9px] text-zinc-400">
                {tech}
              </span>
            ))}
          </div>

          {progress?.repoUrl && (
            <a
              href={progress.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11.5px] text-zinc-300 hover:border-arcane-400/25 hover:text-white"
            >
              <GitBranch className="h-3.5 w-3.5" /> Abrir repositório
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="panel p-6">
            <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
              <ListChecks className="h-4 w-4 text-arcane-300" />
              <h2 className="text-[13px] font-medium text-white">Requisitos obrigatórios</h2>
              <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                definition of done
              </span>
            </div>
            <ul className="space-y-2.5">
              {project.requirements.map((req, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-zinc-400">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-arcane-400/25 bg-arcane-500/[0.08] font-mono text-[8px] text-arcane-300">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {req}
                </li>
              ))}
            </ul>
          </div>

          {project.stretchGoals.length > 0 && (
            <div className="panel p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
                <Rocket className="h-4 w-4 text-ember/80" />
                <h2 className="text-[13px] font-medium text-white">Stretch goals</h2>
                <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                  diferencial de portfólio
                </span>
              </div>
              <ul className="space-y-2.5">
                {project.stretchGoals.map((goal, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-zinc-500">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember/50" />
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel p-6">
            <h2 className="mb-4 text-[13px] font-medium text-white">Critérios de avaliação</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Funcional", "Todos os requisitos obrigatórios implementados e demonstráveis."],
                ["Testes", "Cobertura dos caminhos felizes, erros, limites e concorrência."],
                ["Operação", "README com como rodar, variáveis, migrations e deploy."],
                ["Qualidade", "Código legível, coeso, com decisões de design justificadas."],
                ["Performance", "Evidência de carga/latência compatível com o SLO definido."],
                ["Observabilidade", "Logs estruturados, métricas e traces dos fluxos críticos."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-200">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400/70" /> {title}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <ProjectForm
            projectId={project.id}
            initialStatus={progress?.status ?? "todo"}
            initialRepo={progress?.repoUrl ?? ""}
            initialNotes={progress?.notes ?? ""}
          />

          <div className="panel p-5">
            <p className="eyebrow mb-3">Como entregar</p>
            <ol className="space-y-3">
              {[
                "Crie o repositório e escreva o README antes de codar (design-first).",
                "Implemente em fatias verticais: um fluxo ponta a ponta por vez.",
                "Adicione testes e CI desde o primeiro commit — não deixe para o fim.",
                "Meça antes de otimizar: latência, throughput e taxa de erro.",
                "Grave um vídeo de 3 min demonstrando o sistema e as decisões.",
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11.5px] leading-relaxed text-zinc-500">
                  <span className="font-mono text-[9px] text-arcane-400/70">0{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <Link href="/projetos" className="flex items-center gap-2 px-1 text-[11.5px] text-zinc-500 hover:text-arcane-300">
            <ArrowLeft className="h-3.5 w-3.5" /> Todos os projetos
          </Link>
        </aside>
      </div>
    </div>
  );
}
