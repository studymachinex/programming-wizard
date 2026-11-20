import Link from "next/link";
import {
  Clock,
  Database,
  Download,
  HardDrive,
  Info,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
} from "lucide-react";
import { ensureProfile, getGlobalStats, PROFILE_ID } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { formatMinutes } from "@/lib/utils";
import { SettingsForm } from "@/components/settings-form";
import { ResetProgressButton } from "@/components/reset-progress-button";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const [profile, stats, counts] = await Promise.all([
    ensureProfile(),
    getGlobalStats(),
    Promise.all([
      prisma.lessonProgress.count({ where: { profileId: PROFILE_ID } }),
      prisma.exerciseProgress.count({ where: { profileId: PROFILE_ID } }),
      prisma.problemProgress.count({ where: { profileId: PROFILE_ID } }),
      prisma.studySession.count({ where: { profileId: PROFILE_ID, minutes: { gt: 0 } } }),
      prisma.reviewItem.count({ where: { profileId: PROFILE_ID } }),
      prisma.activityLog.count({ where: { profileId: PROFILE_ID } }),
    ]),
  ]);
  const [lessonsTouched, exercisesTouched, problemsTouched, studyDays, reviews, activity] = counts;

  return (
    <div>
      <PageHeader
        eyebrow="Seu grimório"
        title={
          <>
            Tudo fica na sua <span className="font-display italic text-arcane-200">máquina</span>.
          </>
        }
        description="Sem conta, sem nuvem, sem telemetria. Seu progresso vive no PostgreSQL local, protegido pelos volumes do Docker. Aqui você ajusta o perfil, exporta um backup e, se precisar, recomeça do zero."
        actions={
          <>
            <a href="/api/export" download className="btn-secondary">
              <Download className="h-4 w-4" /> Exportar backup
            </a>
            <Link href="/progresso" className="btn-primary">
              <Sparkles className="h-4 w-4" /> Ver progresso
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          <SettingsForm
            initialName={profile.name}
            initialGoal={profile.dailyGoalMinutes}
            initialRole={profile.targetRole}
          />

          <div className="panel p-6">
            <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
              <HardDrive className="h-4 w-4 text-arcane-300" />
              <h2 className="text-[14px] font-semibold text-white">Dados e persistência</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Aulas tocadas", lessonsTouched],
                ["Exercícios tocados", exercisesTouched],
                ["Desafios tocados", problemsTouched],
                ["Dias com estudo", studyDays],
                ["Revisões agendadas", reviews],
                ["Eventos de atividade", activity],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
                >
                  <span className="text-[11.5px] text-zinc-400">{label}</span>
                  <span className="font-mono text-[12px] text-zinc-200">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-mana/15 bg-mana/[0.04] p-3.5">
              <p className="flex items-center gap-2 text-[11.5px] font-medium text-mana/90">
                <Database className="h-3.5 w-3.5" /> Onde os dados moram
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                PostgreSQL no container <code className="text-zinc-300">pw-postgres</code> (porta
                5434), volume <code className="text-zinc-300">pw-postgres-data</code>. Redis no
                container <code className="text-zinc-300">pw-redis</code> (porta 6380), volume{" "}
                <code className="text-zinc-300">pw-redis-data</code>.{" "}
                <code className="text-zinc-300">docker compose down</code> preserva os dois;{" "}
                <code className="text-zinc-300">down -v</code> apaga.
              </p>
            </div>
          </div>

          <div className="panel border-rose-400/15 p-6">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-rose-300/80" />
              <h2 className="text-[14px] font-semibold text-white">Zona de perigo</h2>
            </div>
            <p className="mb-4 max-w-xl text-[11.5px] leading-relaxed text-zinc-500">
              Apaga apenas o seu progresso — o conteúdo das trilhas, exercícios e projetos continua
              intacto. Exporte um backup antes de recomeçar.
            </p>
            <ResetProgressButton />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-arcane-300" />
              <p className="eyebrow">Resumo</p>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-zinc-500">Perfil</span>
                <span className="text-[12px] text-zinc-200">{profile.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-zinc-500">Meta diária</span>
                <span className="text-[12px] text-zinc-200">{profile.dailyGoalMinutes} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-zinc-500">Tempo total</span>
                <span className="text-[12px] text-zinc-200">{formatMinutes(stats.minutes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-zinc-500">Sequência</span>
                <span className="text-[12px] text-zinc-200">{stats.streak} dias</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-zinc-500">Aulas</span>
                <span className="text-[12px] text-zinc-200">
                  {stats.lessonsDone}/{stats.lessonsTotal}
                </span>
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-mana/80" />
              <p className="eyebrow">Backup</p>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              O arquivo JSON inclui perfil, aulas, código dos exercícios, notas, desafios, projetos,
              sessões de estudo, revisões e histórico de atividade. Guarde no seu drive ou no
              repositório privado.
            </p>
            <a href="/api/export" download className="btn-secondary mt-4 w-full py-2 text-[12px]">
              <Download className="h-3.5 w-3.5" /> Baixar JSON
            </a>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-rune/80" />
              <p className="eyebrow">Comandos úteis</p>
            </div>
            <div className="mt-3 space-y-2 font-mono text-[10.5px] text-zinc-400">
              <p><span className="text-arcane-300">npm run db:up</span> · sobe Postgres + Redis</p>
              <p><span className="text-arcane-300">npm run db:push</span> · aplica o schema</p>
              <p><span className="text-arcane-300">npm run seed</span> · recarrega o conteúdo</p>
              <p><span className="text-arcane-300">npm run dev</span> · inicia em :3000</p>
            </div>
          </div>

          <div className="rounded-xl border border-arcane-400/15 bg-gradient-to-br from-arcane-500/[0.08] to-transparent p-5">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-arcane-300" />
              <p className="text-[12px] font-medium text-white">Sem login, de propósito</p>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-500">
              A plataforma assume um único perfil local. Se quiser estudar em outra máquina, exporte o
              JSON e mantenha o banco — não há sincronização automática.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
