import Link from "next/link";
import { ArrowLeft, Compass, Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="relative mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-arcane-400/20 bg-arcane-500/10 text-arcane-300 shadow-glow">
        <Compass className="h-7 w-7" />
        <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-mana/70" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-arcane-400/70">
        página não encontrada
      </p>
      <h1 className="mt-3 max-w-lg text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
        Esse feitiço não existe{" "}
        <span className="font-display italic text-arcane-200">(ainda)</span>.
      </h1>
      <p className="mt-3 max-w-md text-[13px] leading-relaxed text-zinc-500">
        O link pode estar quebrado, ou o conteúdo ainda não foi semeado. Volte ao dashboard e
        continue de onde parou.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <Link href="/" className="btn-primary">
          <ArrowLeft className="h-4 w-4" /> Voltar ao dashboard
        </Link>
        <Link href="/trilhas" className="btn-secondary">
          Explorar trilhas
        </Link>
      </div>
    </div>
  );
}
