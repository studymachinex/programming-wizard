import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  Globe,
  Mic,
  Target,
  Trophy,
} from "lucide-react";
import { getTrackSummaries } from "@/lib/data";
import { cn, formatMinutes, pct } from "@/lib/utils";
import { PageHeader, ProgressBar, TrackIcon, accentOf } from "@/components/ui";

export const dynamic = "force-dynamic";

const phases = [
  {
    weeks: "Semanas 1–4",
    title: "Fundação sem buracos",
    hours: "12h/semana",
    focus: "Java, POO e disciplina de estudo",
    tracks: ["java-fundamentos", "poo-design"],
    details: [
      "2 aulas por dia útil + 1 exercício local por módulo.",
      "Implemente tudo no IDE desde o primeiro dia; nada de copiar código.",
      "Resolva 4 problemas fáceis por semana (Beecrowd/LeetCode) para ganhar fluência.",
      "Meta: explicar JDK/JVM, coleções, herança, interfaces e SOLID sem consultar.",
    ],
    checkpoint: "Um CRUD de console em Java, com testes JUnit e código que você não tem vergonha de mostrar.",
  },
  {
    weeks: "Semanas 5–10",
    title: "Estruturas de dados e algoritmos",
    hours: "14h/semana",
    focus: "O coração técnico das entrevistas",
    tracks: ["estruturas-dados"],
    details: [
      "Cada estrutura: implemente do zero, entenda a complexidade e use a versão da JDK.",
      "Resolva 6–8 problemas por semana, sempre nos níveis 1–3 antes de subir.",
      "Treine two pointers, sliding window, hash maps, árvores, heaps e grafos.",
      "1 mock interview de 45 min por semana a partir da semana 8.",
    ],
    checkpoint: "Implementar HashMap, LRU, heap, trie e Dijkstra do zero; resolver 40+ problemas com padrão reconhecido em <10 min.",
  },
  {
    weeks: "Semanas 11–14",
    title: "Java de produção e dados",
    hours: "14h/semana",
    focus: "JVM, concorrência, SQL e performance",
    tracks: ["java-avancado", "sql-postgres"],
    details: [
      "Concorrência é o filtro sênior: threads, locks, executors, virtual threads.",
      "Modele um schema real, escreva queries com window functions e leia EXPLAIN.",
      "Meça com JMH; descubra um gargalo e documente a melhoria.",
      "Resolva 20 problemas de SQL e 10 de concorrência.",
    ],
    checkpoint: "Diagnosticar um deadlock e uma query lenta com evidências, não com achismo.",
  },
  {
    weeks: "Semanas 15–18",
    title: "Backend, mensageria e distribuídos",
    hours: "15h/semana",
    focus: "Construir sistemas que aguentam o mundo real",
    tracks: ["redes-backend", "quarkus-backend", "kafka-streaming", "mongodb-redis", "sistemas-distribuidos"],
    details: [
      "Construa uma API Quarkus com Postgres, Redis, Kafka e testes de integração.",
      "Aprenda outbox, saga e idempotência implementando — não só lendo.",
      "Modele um domínio com MongoDB e implemente cache-aside com Redis.",
      "Resolva 2 estudos de caso de system design por semana.",
    ],
    checkpoint: "Um serviço com outbox + Kafka + idempotência, rodando via docker compose e com README de operação.",
  },
  {
    weeks: "Semanas 19–21",
    title: "Reatividade, cloud e System Design",
    hours: "14h/semana",
    focus: "Operar, desenhar e não bloquear em escala",
    tracks: ["reatividade-async", "cloud-devops", "system-design-interview"],
    details: [
      "Construa um pipeline com Mutiny, backpressure e circuit breaker antes de operar em Kubernetes.",
      "Dockerize a aplicação, suba em Kubernetes local (kind/minikube) e escreva CI.",
      "Domine os building blocks: cache, filas, sharding, rate limit, consistent hashing.",
      "Faça 2 designs completos por semana em 45 min, em voz alta.",
    ],
    checkpoint: "Desenhar Uber, feed e rate limiter no quadro branco, com capacity estimation e trade-offs.",
  },
  {
    weeks: "Semanas 22–24",
    title: "Reta final: entrevistas",
    hours: "15h/semana",
    focus: "Performance, narrativa e oferta",
    tracks: ["algoritmos-avancados", "system-design-interview"],
    details: [
      "2 mock interviews de coding + 1 de design por semana, gravadas.",
      "Revise os padrões que mais errou; não aprenda tópico novo às vésperas.",
      "Prepare 8 histórias STAR com métricas e conflitos reais.",
      "Ajuste currículo/LinkedIn para impacto: verbos de ação + números.",
    ],
    checkpoint: "Resolver 2 mediums em 45 min, conduzir um design de 45 min e responder behavioral sem gaguejar.",
  },
];

const routine = [
  ["Segunda", "45 min teoria", "60 min exercício do módulo", "30 min 1 problema externo"],
  ["Terça", "45 min teoria", "60 min implementação", "15 min revisão espaçada"],
  ["Quarta", "30 min teoria", "90 min projeto/desafio", "30 min 1 problema externo"],
  ["Quinta", "45 min teoria", "60 min exercício", "15 min revisão"],
  ["Sexta", "30 min teoria", "60 min coding", "30 min retroativa da semana"],
  ["Sábado", "2h projeto capstone", "1h mock interview", "30 min revisão"],
  ["Domingo", "descanso ativo", "leitura técnica leve", "planejamento da semana"],
];

export default async function PlanPage() {
  const tracks = await getTrackSummaries();
  const bySlug = new Map(tracks.map((t) => [t.slug, t]));
  const totalLessons = tracks.reduce((s, t) => s + t.lessonCount, 0);
  const doneLessons = tracks.reduce((s, t) => s + t.lessonsDone, 0);
  const totalSolved = tracks.reduce((s, t) => s + t.exercisesDone + t.problemsDone, 0);
  const totalMinutes = tracks.reduce((s, t) => s + Math.round((t.estimatedHours * 60 * t.percent) / 100), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Plano de 24 semanas"
        title={
          <>
            Um caminho <span className="font-display italic text-arcane-200">realista</span> para virar sênior.
          </>
        }
        description="10–15 horas por semana, compatíveis com um trabalho de tempo integral. Seis fases, checkpoints objetivos e uma regra: nada de avançar sem entregar. Siga a ordem, mas ajuste o ritmo à sua vida."
        actions={
          <div className="panel px-4 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">seu avanço no plano</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-sm font-medium text-white">{pct(doneLessons, totalLessons)}%</span>
              <div className="w-24">
                <ProgressBar value={pct(doneLessons, totalLessons)} />
              </div>
            </div>
          </div>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: CalendarDays, label: "semanas", value: "24" },
          { icon: Clock, label: "por semana", value: "10–15h" },
          { icon: BookOpen, label: "aulas", value: totalLessons },
          { icon: Trophy, label: "desafios resolvidos", value: totalSolved },
        ].map((item) => (
          <div key={item.label} className="panel flex items-center gap-3 p-4">
            <item.icon className="h-4 w-4 text-zinc-600" />
            <div>
              <p className="text-lg font-semibold leading-none text-white">{item.value}</p>
              <p className="mt-1 font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {/* Phases */}
          <div className="space-y-4">
            {phases.map((phase, index) => {
              const phaseTracks = phase.tracks.map((s) => bySlug.get(s)).filter(Boolean);
              const lessons = phaseTracks.reduce((s, t) => s + (t?.lessonCount ?? 0), 0);
              const done = phaseTracks.reduce((s, t) => s + (t?.lessonsDone ?? 0), 0);
              const progress = pct(done, lessons);
              return (
                <div key={phase.weeks} className="panel relative overflow-hidden p-6">
                  <div className="pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-arcane-400/50 via-arcane-500/10 to-transparent" />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-arcane-400/20 bg-arcane-500/[0.08] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-arcane-300">
                          fase {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                          {phase.weeks} · {phase.hours}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{phase.title}</h2>
                      <p className="mt-1 text-[12px] text-zinc-500">{phase.focus}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-lg font-semibold text-white">{progress}%</p>
                        <p className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                          {done}/{lessons} aulas
                        </p>
                      </div>
                      <div className="w-16">
                        <ProgressBar value={progress} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {phase.details.map((detail, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-zinc-400">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-arcane-400/50" />
                        {detail}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {phaseTracks.map((track) =>
                      track ? (
                        <Link
                          key={track.slug}
                          href={`/trilhas/${track.slug}`}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition-colors",
                            accentOf(track.accent).border,
                            accentOf(track.accent).bg,
                            accentOf(track.accent).text
                          )}
                        >
                          <TrackIcon icon={track.icon} className="h-2.5 w-2.5" />
                          {track.title}
                        </Link>
                      ) : null
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-zinc-600">
                      checkpoint da fase
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">{phase.checkpoint}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Routine */}
          <div className="panel mt-6 overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <p className="eyebrow mb-1">Rotina semanal</p>
              <h2 className="text-[15px] font-semibold text-white">O template que funciona com trabalho full-time</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-white/[0.02] font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th className="px-5 py-2.5">dia</th>
                    <th className="px-3 py-2.5">bloco 1</th>
                    <th className="px-3 py-2.5">bloco 2</th>
                    <th className="px-3 py-2.5">bloco 3</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {routine.map((row) => (
                    <tr key={row[0]} className="text-zinc-400">
                      <td className="px-5 py-2.5 font-medium text-zinc-200">{row[0]}</td>
                      <td className="px-3 py-2.5">{row[1]}</td>
                      <td className="px-3 py-2.5">{row[2]}</td>
                      <td className="px-3 py-2.5">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/[0.06] px-5 py-3">
              <p className="text-[10.5px] leading-relaxed text-zinc-600">
                Total: ~11–14h. Se a semana apertar, corte o bloco 3 antes de cortar a prática. Constância
                vence intensidade.
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="eyebrow mb-3">Como usar a plataforma</p>
            <ol className="space-y-3">
              {[
                "Siga a trilha na ordem. Cada aula tem quiz e exercício local.",
                "Não pule os exercícios: é onde o aprendizado realmente acontece.",
                "Resolva os desafios externos do nível indicado, não os aleatórios.",
                "Volte em /revisao todos os dias. 15 minutos bastam.",
                "Registre tempo no dashboard para manter a meta e a sequência.",
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11px] leading-relaxed text-zinc-500">
                  <span className="font-mono text-[9px] text-arcane-400/70">0{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-arcane-300" />
              <p className="text-[12.5px] font-medium text-white">Critérios de prontidão</p>
            </div>
            <ul className="space-y-2">
              {[
                "150+ problemas resolvidos, 60% medium",
                "2 mediums em 45 min sem ajuda",
                "5 system designs completos no quadro",
                "1 projeto distribuído com métricas",
                "8 histórias STAR com números",
                "Inglês técnico confortável em entrevista",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[11px] text-zinc-500">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/50" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-ember/70" />
              <p className="text-[12.5px] font-medium text-white">O loop das big techs</p>
            </div>
            <div className="space-y-3">
              {[
                ["Coding", "2–4 entrevistas, 45 min, 2 problemas por sessão."],
                ["System Design", "1–2 rodadas, 45–60 min, foco em trade-offs."],
                ["Behavioral", "1–2 rodadas, STAR + cultura e conflitos."],
                ["Bar raiser / Hiring", "consistência de nível e sinais de senioridade."],
              ].map(([title, desc]) => (
                <div key={title} className="border-l border-white/[0.08] pl-3">
                  <p className="text-[11px] font-medium text-zinc-300">{title}</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-zinc-600">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[8.5px] uppercase tracking-wider text-zinc-700">
              varia por empresa e nível
            </p>
          </div>

          <div className="rounded-xl border border-arcane-400/15 bg-gradient-to-br from-arcane-500/[0.08] to-transparent p-5">
            <Mic className="h-4 w-4 text-arcane-300" />
            <p className="mt-2 text-[12px] font-medium text-white">Regra dos 3 mock interviews</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-500">
              Nenhuma entrevista real deve ser sua primeira vez explicando em voz alta. Grave-se, assista
              e corrija a narrativa antes de aplicar.
            </p>
          </div>

          <div className="panel p-5">
            <Globe className="h-4 w-4 text-mana/70" />
            <p className="mt-2 text-[12px] font-medium text-white">Inglês desde a semana 1</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-500">
              Leia documentação em inglês, escreva commit messages em inglês e faça os mocks em inglês
              nas últimas 6 semanas. Não deixe para a véspera.
            </p>
          </div>

          <div className="panel p-5">
            <p className="eyebrow mb-2">Tempo investido</p>
            <p className="text-2xl font-semibold text-white">{formatMinutes(totalMinutes)}</p>
            <p className="mt-1 text-[10.5px] text-zinc-600">
              estimado a partir do progresso das trilhas
            </p>
            <Link href="/progresso" className="mt-3 inline-flex items-center gap-1 text-[10.5px] text-arcane-300 hover:text-arcane-200">
              ver análise detalhada <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="flex items-center gap-2 px-1">
            <Compass className="h-3.5 w-3.5 text-zinc-700" />
            <p className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-700">
              ajuste o plano, não desista do objetivo
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
