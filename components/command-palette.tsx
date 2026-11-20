"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Code2,
  FolderKanban,
  Loader2,
  Map,
  RotateCcw,
  Search,
  Settings,
  Trophy,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Result = {
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

const quickLinks: Result[] = [
  { type: "Ir para", title: "Trilhas", subtitle: "Todas as trilhas de estudo", href: "/trilhas" },
  { type: "Ir para", title: "Exercícios", subtitle: "Desafios com código Java", href: "/exercicios" },
  { type: "Ir para", title: "Desafios externos", subtitle: "LeetCode, HackerRank, Beecrowd", href: "/desafios" },
  { type: "Ir para", title: "Projetos", subtitle: "Capstones de portfólio", href: "/projetos" },
  { type: "Ir para", title: "Revisão espaçada", subtitle: "O que está para revisar", href: "/revisao" },
  { type: "Ir para", title: "Progresso", subtitle: "Métricas e histórico", href: "/progresso" },
  { type: "Ir para", title: "Configurações", subtitle: "Perfil, meta e backup", href: "/configuracoes" },
];

function iconFor(type: string) {
  switch (type) {
    case "Aula":
      return BookOpen;
    case "Exercício":
      return Code2;
    case "Desafio":
      return Trophy;
    case "Projeto":
      return FolderKanban;
    case "Trilha":
      return Map;
    case "Revisão":
      return RotateCcw;
    case "Ir para":
      return ArrowRight;
    default:
      return Search;
  }
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const shown = query.trim().length < 2 ? quickLinks : results;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setQuery("");
      setResults([]);
      setActive(0);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results: Result[] };
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        /* ignore aborted request */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (shown.length ? (i + 1) % shown.length : 0));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
      }
      if (e.key === "Enter" && shown[active]) {
        e.preventDefault();
        router.push(shown[active].href);
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, shown, active, onClose, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-fade-up overflow-hidden rounded-2xl border border-arcane-400/20 bg-ink-850 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className="h-4 w-4 shrink-0 text-arcane-300" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar aulas, exercícios, problemas..."
            className="h-14 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-zinc-600"
          />
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          ) : (
            <button onClick={onClose} className="rounded-md p-1 text-zinc-600 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {query.trim().length >= 2 && !loading && shown.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-zinc-400">Nada encontrado para “{query}”.</p>
              <p className="mt-1 text-xs text-zinc-600">Tente “hash map”, “kafka” ou “dynamic programming”.</p>
            </div>
          )}
          {query.trim().length < 2 && (
            <p className="px-3 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-zinc-600">
              Atalhos
            </p>
          )}
          {shown.map((item, index) => {
            const Icon = iconFor(item.type);
            return (
              <button
                key={`${item.href}-${item.title}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  router.push(item.href);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  active === index ? "bg-arcane-500/[0.14]" : "hover:bg-white/[0.04]"
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
                    active === index
                      ? "border-arcane-400/30 bg-arcane-500/15 text-arcane-200"
                      : "border-white/[0.07] bg-white/[0.03] text-zinc-500"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-zinc-100">{item.title}</span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                      {item.type}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{item.subtitle}</span>
                </span>
                {active === index && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-arcane-300" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 font-mono text-[9.5px] text-zinc-600">
          <span className="flex items-center gap-2">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> navegar
            <kbd className="kbd">↵</kbd> abrir
          </span>
          <span className="flex items-center gap-1">
            <Settings className="h-3 w-3" /> busca local
          </span>
        </div>
      </div>
    </div>
  );
}
