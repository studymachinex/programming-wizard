import { CheckCircle2, ListChecks } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { ActivityCard, ReflectionList } from "@/components/lesson-activity-client";

export type LessonActivityView = {
  id: string;
  kind: string;
  title: string;
  statement: string;
  starterCode: string;
  solutionCode: string;
  hints: string[];
  code: string;
  done: boolean;
  attempts: number;
};

/**
 * Seção "Atividades" no fim da aula: exercícios de código validados pelo runner e itens de
 * autoavaliação (explicar, comparar) que o aluno marca sozinho.
 */
export function LessonActivities({ activities }: { activities: LessonActivityView[] }) {
  if (!activities.length) return null;
  const code = activities.filter((a) => a.kind === "code");
  const reflections = activities.filter((a) => a.kind === "reflection");
  const done = activities.filter((a) => a.done).length;
  const firstPending = code.find((a) => !a.done)?.id;

  return (
    <section id="atividades" className="mt-12 scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[1.5rem] font-semibold tracking-[-0.02em] text-white">
            <ListChecks className="h-5 w-5 text-arcane-300" /> Atividades
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-400">
            Pratique o que a aula ensinou. As atividades de código rodam aqui mesmo: passe em todos os testes para concluir.
          </p>
        </div>
        <span className={done === activities.length ? "flex items-center gap-1.5 font-mono text-[11px] text-emerald-300" : "font-mono text-[11px] text-zinc-500"}>
          {done === activities.length && <CheckCircle2 className="h-3.5 w-3.5" />}
          {done}/{activities.length} concluídas
        </span>
      </div>

      <div className="space-y-4">
        {code.map((activity, i) => (
          <ActivityCard
            key={activity.id}
            index={i + 1}
            activity={activity}
            defaultOpen={activity.id === firstPending}
            statement={<Markdown content={activity.statement} className="lesson-prose-compact" />}
          />
        ))}
        {reflections.length > 0 && <ReflectionList items={reflections.map((r) => ({ id: r.id, title: r.title, done: r.done }))} />}
      </div>
    </section>
  );
}
