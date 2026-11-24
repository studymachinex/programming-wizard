"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  ChartColumn,
  ChevronRight,
  Code2,
  Command,
  Flame,
  FolderKanban,
  LayoutDashboard,
  Map,
  Menu,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { cn, pct } from "@/lib/utils";
import type { GlobalStats } from "@/lib/data";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((mod) => mod.CommandPalette),
  { ssr: false }
);

const nav = [
  {
    label: "Visão geral",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Aprender",
    items: [
      { href: "/trilhas", label: "Trilhas", icon: Map },
      { href: "/exercicios", label: "Exercícios", icon: Code2 },
      { href: "/desafios", label: "Desafios externos", icon: Trophy },
      { href: "/projetos", label: "Projetos", icon: FolderKanban },
    ],
  },
  {
    label: "Evoluir",
    items: [
      { href: "/revisao", label: "Revisão espaçada", icon: RotateCcw },
      { href: "/progresso", label: "Progresso", icon: ChartColumn },
      { href: "/plano", label: "Plano de estudo", icon: BookOpen },
    ],
  },
];

export function AppShell({
  children,
  stats,
  name,
  targetRole,
}: {
  children: React.ReactNode;
  stats: GlobalStats;
  name: string;
  targetRole: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const percent = pct(stats.lessonsDone, stats.lessonsTotal);

  return (
    <div className="min-h-screen">
      {paletteOpen && (
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-white/[0.06] bg-ink-900/95 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 lg:bg-ink-900/60",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-5">
          <Link href="/" className="group flex items-center gap-3">
            <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-arcane-400/30 bg-gradient-to-br from-arcane-500/30 to-mana/10 shadow-glow">
              <Sparkles className="h-[18px] w-[18px] text-arcane-200" />
              <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-arcane-300/60 to-transparent" />
            </span>
            <span className="leading-none">
              <span className="block text-[13px] font-semibold tracking-tight text-white">
                Programming Wizard
              </span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.24em] text-arcane-400/70">
                arcane engineering
              </span>
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          {nav.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="mb-2 px-3 font-mono text-[9.5px] uppercase tracking-[0.2em] text-zinc-600">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all",
                        active
                          ? "bg-arcane-500/[0.12] text-white"
                          : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-100"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-arcane-400" />
                      )}
                      <Icon
                        className={cn(
                          "h-[16px] w-[16px] transition-colors",
                          active ? "text-arcane-300" : "text-zinc-500 group-hover:text-zinc-300"
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/revisao" && stats.reviewsDue > 0 && (
                        <span className="rounded-full bg-ember/15 px-1.5 py-0.5 font-mono text-[10px] text-ember">
                          {stats.reviewsDue}
                        </span>
                      )}
                      {active && <ChevronRight className="h-3 w-3 text-arcane-400/50" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.06] p-3">
          <Link
            href="/progresso"
            className="group block rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5 transition-colors hover:border-arcane-400/20 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">
                Jornada
              </span>
              <span className="font-mono text-[10px] text-arcane-300">{percent}%</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-arcane-500 to-mana transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {stats.lessonsDone} de {stats.lessonsTotal} aulas
            </p>
          </Link>
          <Link
            href="/configuracoes"
            className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-[12px] text-zinc-500 transition-colors hover:bg-white/[0.035] hover:text-zinc-200"
          >
            <Settings className="h-4 w-4" />
            Configurações
          </Link>
          <div className="mt-1 flex items-center justify-between px-3 py-1.5">
            <span className="flex items-center gap-2 text-[10px] text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-rune shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              modo local
            </span>
            <span className="max-w-[120px] truncate font-mono text-[9px] text-zinc-700">{targetRole}</span>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-ink-950/75 px-4 backdrop-blur-xl sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 w-full max-w-xs items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 text-left text-[12.5px] text-zinc-500 transition-colors hover:border-arcane-400/20 hover:bg-white/[0.04]"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1">Buscar aulas, exercícios...</span>
            <span className="hidden items-center gap-0.5 sm:flex">
              <kbd className="kbd">Ctrl</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              href="/progresso"
              className="hidden items-center gap-1.5 rounded-full border border-ember/15 bg-ember/[0.07] px-3 py-1.5 text-[11px] text-ember sm:flex"
            >
              <Flame className="h-3.5 w-3.5" />
              <span className="font-mono">{stats.streak}</span>
              <span className="text-ember/60">dias</span>
            </Link>
            <Link
              href="/progresso"
              className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 md:flex"
            >
              <Trophy className="h-3.5 w-3.5 text-arcane-300" />
              {stats.lessonsDone + stats.exercisesDone + stats.problemsDone} conquistas
            </Link>
            <Link
              href="/configuracoes"
              className="grid h-8 w-8 place-items-center rounded-full border border-arcane-400/20 bg-gradient-to-br from-arcane-500/25 to-mana/10 font-mono text-[11px] font-semibold text-arcane-200"
              title={name}
            >
              {name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-7 sm:px-6 lg:px-8 lg:pt-9">
          {children}
        </main>

        <footer className="mx-auto flex w-full max-w-[1240px] flex-col gap-2 border-t border-white/[0.05] px-4 py-6 text-[11px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="flex items-center gap-2 font-mono">
            <Command className="h-3 w-3" /> programming wizard · estudo local
          </span>
          <span>Java 21 · PostgreSQL · Redis · Docker · sem login, sem distração</span>
        </footer>
      </div>
    </div>
  );
}
