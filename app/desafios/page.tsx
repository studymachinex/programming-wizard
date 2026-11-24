import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Layers,
  Search,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { getProblemCatalog, getTrackDirectory } from "@/lib/data";
import { cn, difficultyLabel, difficultyStyles, pct } from "@/lib/utils";
import { ProblemToggle } from "@/components/problem-toggle";
import { EmptyState, PageHeader, ProgressBar, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

const levels = [
  { level: 1, label: "Aquecimento", hint: "fundamentos e sintaxe" },
  { level: 2, label: "Base sólida", hint: "padrões essenciais" },
  { level: 3, label: "Intermediário", hint: "combina padrões" },
  { level: 4, label: "Difícil", hint: "nível de entrevista" },
  { level: 5, label: "FAANG", hint: "o filtro final" },
];

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    trilha?: string;
    plataforma?: string;
    dificuldade?: string;
    nivel?: string;
    status?: string;
    q?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const [problems, tracks] = await Promise.all([
    getProblemCatalog(),
    getTrackDirectory(),
  ]);

  const total = problems.length;
  const solved = problems.filter((p) => p.progress[0]?.status === "solved").length;

  const filtered = problems.filter((p) => {
    if (params.trilha && p.track?.slug !== params.trilha) return false;
    if (params.plataforma && p.platform !== params.plataforma) return false;
    if (params.dificuldade && p.difficulty !== params.dificuldade) return false;
    if (params.nivel && p.level !== Number(params.nivel)) return false;
    if (params.status === "resolvidos" && p.progress[0]?.status !== "solved") return false;
    if (params.status === "pendentes" && p.progress[0]?.status === "solved") return false;
    if (params.q) {
      const q = params.q.toLowerCase();
      const hay = `${p.title} ${p.topic} ${p.platform} ${p.track?.title ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function hrefWith(patch: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const merged = { ...params, pagina: undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return `/desafios${qs ? `?${qs}` : ""}`;
  }

  const PAGE_SIZE = 48;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(params.pagina) || 1), totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const platforms = [...new Set(problems.map((p) => p.platform))].sort();
  const hasFilters = Boolean(
    params.trilha || params.plataforma || params.dificuldade || params.nivel || params.status || params.q
  );
  const tracksWithProblems = tracks.filter((t) => problems.some((p) => p.track?.slug === t.slug));

  return (
    <div>
      <PageHeader
        eyebrow="LeetCode · HackerRank · Beecrowd"
        title={
          <>
            Desafios externos, <span className="font-display italic text-arcane-200">curados</span> por nível.
          </>
        }
        description="Não é uma lista aleatória. Cada problema está no nível e no momento certos da sua jornada, ligado ao padrão que você acabou de estudar. Resolva, marque e acompanhe."
        actions={
          <div className="panel flex items-center gap-4 px-4 py-2.5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">resolvidos</p>
              <p className="mt-0.5 text-sm font-medium text-white">
                {solved} <span className="text-zinc-500">/ {total}</span>
              </p>
            </div>
            <div className="h-8 w-px bg-white/[0.07]" />
            <p className="font-mono text-lg font-semibold text-rune">{pct(solved, total)}%</p>
          </div>
        }
      />

      {/* level progress */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {levels.map((l) => {
          const items = problems.filter((p) => p.level === l.level);
          const done = items.filter((p) => p.progress[0]?.status === "solved").length;
          return (
            <Link
              key={l.level}
              href={hrefWith({ nivel: params.nivel === String(l.level) ? undefined : String(l.level) })}
              className={cn(
                "panel p-3.5 transition-colors hover:border-arcane-400/20",
                params.nivel === String(l.level) && "border-arcane-400/30 bg-arcane-500/[0.06]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">nível {l.level}</span>
                <span className="font-mono text-[9px] text-zinc-500">{done}/{items.length}</span>
              </div>
              <p className="mt-1 text-[11.5px] font-medium text-zinc-200">{l.label}</p>
              <div className="mt-2">
                <ProgressBar value={pct(done, items.length)} />
              </div>
              <p className="mt-1.5 font-mono text-[8.5px] text-zinc-600">{l.hint}</p>
            </Link>
          );
        })}
      </div>

      {/* filters */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            <Filter className="h-3 w-3" /> plataforma
          </span>
          <Link
            href={hrefWith({ plataforma: undefined })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px]",
              !params.plataforma
                ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-100"
                : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
            )}
          >
            todas
          </Link>
          {platforms.map((p) => (
            <Link
              key={p}
              href={hrefWith({ plataforma: p })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px]",
                params.plataforma === p
                  ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-100"
                  : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
              )}
            >
              {p}
              <span className="ml-1 text-zinc-700">
                {problems.filter((x) => x.platform === p).length}
              </span>
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-white/[0.07]" />
          <Link
            href={hrefWith({ status: params.status === "pendentes" ? undefined : "pendentes" })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px]",
              params.status === "pendentes"
                ? "border-ember/25 bg-ember/10 text-ember"
                : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-200"
            )}
          >
            pendentes
          </Link>
          {hasFilters && (
            <Link href="/desafios" className="text-[10.5px] text-zinc-600 underline-offset-4 hover:text-arcane-300 hover:underline">
              limpar
            </Link>
          )}
          <form action="/desafios" className="ml-auto flex items-center gap-1.5">
            <div className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5">
              <Search className="h-3 w-3 text-zinc-600" />
              <input
                name="q"
                defaultValue={params.q}
                placeholder="two sum, grafo..."
                className="w-36 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700"
              />
            </div>
          </form>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Link
            href={hrefWith({ trilha: undefined })}
            className={cn(
              "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider",
              !params.trilha
                ? "border-arcane-400/25 bg-arcane-500/10 text-arcane-200"
                : "border-white/[0.06] text-zinc-600 hover:text-zinc-300"
            )}
          >
            todas as trilhas
          </Link>
          {tracksWithProblems.map((track) => {
            const a = accentOf(track.accent);
            return (
              <Link
                key={track.slug}
                href={hrefWith({ trilha: track.slug })}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px]",
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
          icon={<Trophy className="h-5 w-5" />}
          title="Nenhum desafio com esses filtros"
          description="O banco de problemas ainda está sendo populado, ou seus filtros estão muito restritos."
          action={
            <Link href="/desafios" className="btn-secondary">
              Limpar filtros
            </Link>
          }
        />
      ) : (
        <div className="space-y-7">
          {levels.map((level) => {
            const items = pageItems.filter((p) => p.level === level.level);
            if (!items.length) return null;
            const levelItems = problems.filter((p) => p.level === level.level);
            const done = levelItems.filter((p) => p.progress[0]?.status === "solved").length;
            return (
              <section key={level.level}>
                <div className="mb-2.5 flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-md border border-arcane-400/20 bg-arcane-500/10 font-mono text-[10px] text-arcane-300">
                    {level.level}
                  </span>
                  <h2 className="text-[13px] font-medium text-white">{level.label}</h2>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{level.hint}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="h-1 w-16 rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-arcane-400" style={{ width: `${pct(done, levelItems.length)}%` }} />
                    </div>
                    <span className="font-mono text-[9px] text-zinc-600">{done}/{levelItems.length}</span>
                  </div>
                </div>
                <div className="panel divide-y divide-white/[0.04] overflow-hidden">
                  {items.map((problem) => {
                    const isSolved = problem.progress[0]?.status === "solved";
                    const a = problem.track ? accentOf(problem.track.accent) : null;
                    return (
                      <div key={problem.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                        <ProblemToggle problemId={problem.id} solved={isSolved} compact />
                        <div className="min-w-0 flex-1">
                          <a
                            href={problem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "inline-flex items-center gap-1.5 text-[12.5px] transition-colors hover:text-white",
                              isSolved ? "text-zinc-500" : "text-zinc-200"
                            )}
                          >
                            <span className="truncate">{problem.title}</span>
                            <ExternalLink className="h-2.5 w-2.5 shrink-0 text-zinc-700" />
                          </a>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">
                              {problem.platform}
                            </span>
                            <span className="text-zinc-800">·</span>
                            <span className="font-mono text-[8.5px] text-zinc-600">{problem.topic}</span>
                            {problem.track && a && (
                              <>
                                <span className="text-zinc-800">·</span>
                                <span className={cn("flex items-center gap-1 font-mono text-[8.5px]", a.text, "opacity-60")}>
                                  <TrackIcon icon={problem.track.icon} className="h-2 w-2" />
                                  {problem.track.title}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className={cn("hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase sm:block", difficultyStyles[problem.difficulty])}>
                          {difficultyLabel(problem.difficulty)}
                        </span>
                        {isSolved && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
            {filtered.length} desafios · página {currentPage} de {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            {currentPage > 1 ? (
              <Link
                href={hrefWith({ pagina: String(currentPage - 1) })}
                className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-arcane-400/25 hover:text-arcane-200"
              >
                <ChevronLeft className="h-3 w-3" /> anterior
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.04] px-2.5 py-1.5 text-[11px] text-zinc-700">
                <ChevronLeft className="h-3 w-3" /> anterior
              </span>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Link
                key={page}
                href={hrefWith({ pagina: page === 1 ? undefined : String(page) })}
                aria-current={page === currentPage ? "page" : undefined}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md border font-mono text-[10px] transition-colors",
                  page === currentPage
                    ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-100"
                    : "border-white/[0.07] text-zinc-500 hover:border-arcane-400/25 hover:text-arcane-200"
                )}
              >
                {page}
              </Link>
            ))}
            {currentPage < totalPages ? (
              <Link
                href={hrefWith({ pagina: String(currentPage + 1) })}
                className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-arcane-400/25 hover:text-arcane-200"
              >
                próxima <ChevronRight className="h-3 w-3" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.04] px-2.5 py-1.5 text-[11px] text-zinc-700">
                próxima <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Target,
            title: "Não conte problemas. Conte padrões.",
            text: "Se você resolveu 5 problemas de sliding window, você domina o padrão. Repetição cega não escala.",
          },
          {
            icon: Layers,
            title: "Uma plataforma, um idioma.",
            text: "Escolha Java sempre. Você quer treinar a linguagem da entrevista, não só o algoritmo.",
          },
          {
            icon: Sparkles,
            title: "Registre o insight.",
            text: "Depois de cada problema, escreva em uma frase por que a solução funcionou. Isso vira seu repertório.",
          },
        ].map((tip) => (
          <div key={tip.title} className="panel p-5">
            <tip.icon className="h-4 w-4 text-arcane-300/70" />
            <h3 className="mt-3 text-[12.5px] font-medium text-white">{tip.title}</h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-500">{tip.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
