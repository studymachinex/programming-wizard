"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw, Terminal } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-rose-400/25 bg-rose-400/10 text-rose-300">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-rose-300/70">
        conjuração interrompida
      </p>
      <h1 className="mt-3 max-w-lg text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
        Algo quebrou no círculo mágico.
      </h1>
      <p className="mt-3 max-w-md text-[13px] leading-relaxed text-zinc-500">
        Pode ser o banco fora do ar, uma migration pendente ou um bug de verdade. Tente novamente;
        se persistir, confira os containers e os logs do servidor.
      </p>

      {error.digest && (
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-zinc-700">
          <Terminal className="h-3 w-3" /> digest {error.digest}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <button onClick={reset} className="btn-primary">
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
        <Link href="/" className="btn-secondary">
          <Home className="h-4 w-4" /> Ir para o dashboard
        </Link>
      </div>

      <div className="mt-8 max-w-md rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left">
        <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">checklist rápido</p>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-zinc-500">
          <li>1. <code className="text-zinc-300">docker compose ps</code> — Postgres e Redis de pé?</li>
          <li>2. <code className="text-zinc-300">npm run db:push</code> — schema aplicado?</li>
          <li>3. <code className="text-zinc-300">npm run seed</code> — conteúdo carregado?</li>
        </ul>
      </div>
    </div>
  );
}
