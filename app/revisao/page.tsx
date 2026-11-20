import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { getReviewQueue } from "@/lib/data";
import { formatDate } from "@/lib/utils";
import { ReviewActions } from "@/components/review-actions";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const kindLabels: Record<string, string> = {
  lesson: "aula",
  exercise: "exercício",
  problem: "desafio",
};

export default async function ReviewPage() {
  const { due, upcoming } = await getReviewQueue();

  return (
    <div>
      <PageHeader
        eyebrow="Repetição espaçada"
        title={
          <>
            O que você aprendeu, <span className="font-display italic text-arcane-200">de volta</span> na hora certa.
          </>
        }
        description="A curva do esquecimento é implacável. A cada aula ou desafio concluído, a plataforma agenda uma revisão em 1, 3, 7, 14 e 30 dias. Aqui você consolida de verdade."
        actions={
          <div className="panel flex items-center gap-4 px-4 py-2.5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">para hoje</p>
              <p className="mt-0.5 text-sm font-medium text-white">{due.length}</p>
            </div>
            <div className="h-8 w-px bg-white/[0.07]" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">agendadas</p>
              <p className="mt-0.5 text-sm font-medium text-white">{upcoming.length}</p>
            </div>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Brain, title: "Recuperação ativa", text: "Tente lembrar antes de abrir o material. O esforço de recordar é o que cria memória." },
          { icon: Clock, title: "Intervalos crescentes", text: "1 dia, 3 dias, 7 dias, 14 dias, 30 dias. Cada acerto empurra a próxima revisão." },
          { icon: Sparkles, title: "Seja honesto", text: "“Errei” reagenda para amanhã. Isso é bom: o sistema está encontrando seu ponto fraco." },
        ].map((item) => (
          <div key={item.title} className="panel p-4">
            <item.icon className="h-4 w-4 text-arcane-300/70" />
            <h3 className="mt-2.5 text-[12px] font-medium text-white">{item.title}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-white">Revisões de hoje</h2>
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              {due.length} {due.length === 1 ? "item" : "itens"}
            </span>
          </div>

          {due.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Nada vencido. Por enquanto."
              description="Conclua novas aulas e exercícios para alimentar a fila, ou volte amanhã para consolidar o que aprendeu."
              action={
                <Link href="/trilhas" className="btn-primary">
                  <BookOpen className="h-4 w-4" /> Continuar estudando
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {due.map((item) => (
                <div key={item.id} className="panel p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="rounded-full border border-arcane-400/20 bg-arcane-500/[0.07] px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-arcane-300">
                          {kindLabels[item.kind] ?? item.kind}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-wider text-ember/70">
                          <RotateCcw className="h-2.5 w-2.5" /> {item.repetitions === 0 ? "primeira revisão" : `${item.repetitions}ª revisão`}
                        </span>
                      </div>
                      <Link href={item.href} className="text-[13.5px] font-medium text-zinc-200 hover:text-white">
                        {item.title}
                      </Link>
                      <p className="mt-1 font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">
                        venceu em {formatDate(item.dueAt)} · intervalo {item.intervalDays}d
                      </p>
                    </div>
                    <div className="shrink-0">
                      <ReviewActions itemId={item.id} />
                    </div>
                  </div>
                  <div className="mt-3 border-t border-white/[0.05] pt-2.5">
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600 transition-colors hover:text-arcane-300"
                    >
                      abrir material para revisar <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <p className="eyebrow">Próximas</p>
              <CalendarClock className="h-3.5 w-3.5 text-zinc-600" />
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 py-5 text-[11px] leading-relaxed text-zinc-600">
                Nenhuma revisão futura ainda. Estude uma aula nova para começar.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {upcoming.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <p className="truncate text-[11px] text-zinc-300">{item.title}</p>
                    <p className="mt-0.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                      <span>{kindLabels[item.kind] ?? item.kind}</span>
                      <span>{formatDate(item.dueAt)}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-arcane-400/15 bg-gradient-to-br from-arcane-500/[0.07] to-transparent p-5">
            <p className="font-display text-[14px] italic leading-relaxed text-arcane-100/90">
              “Não é sobre estudar mais. É sobre revisitar no momento exato em que a memória começa a
              desvanecer.”
            </p>
            <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.16em] text-arcane-400/50">
              curva de ebbinghaus
            </p>
          </div>

          <div className="panel p-5">
            <p className="eyebrow mb-3">Como funciona</p>
            <ol className="space-y-3">
              {[
                "Concluiu uma aula ou desafio → entra na fila para amanhã.",
                "Acertou com facilidade → próximo intervalo cresce (3, 7, 14, 30 dias).",
                "Errou → volta para amanhã e o intervalo reinicia.",
                "O objetivo é chegar a 30 dias mantendo a recuperação sem consultar.",
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11px] leading-relaxed text-zinc-500">
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
