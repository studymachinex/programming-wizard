// Fallback instantâneo ao abrir uma aula (vindo da trilha ou de anterior/próxima).
// Sem ele a tela fica parada até o RSC da aula chegar, ou mostra o esqueleto da trilha.
export default function LessonLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-5 h-3 w-56 rounded-full bg-white/[0.05]" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_292px]">
        <article className="min-w-0">
          <header className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-6 sm:p-7">
            <div className="h-2.5 w-32 rounded-full bg-white/[0.05]" />
            <div className="mt-4 h-8 w-3/4 max-w-xl rounded-xl bg-white/[0.07]" />
            <div className="mt-3 h-3.5 w-2/3 max-w-lg rounded-lg bg-white/[0.04]" />
            <div className="mt-5 flex gap-4">
              <div className="h-2.5 w-16 rounded-full bg-white/[0.05]" />
              <div className="h-2.5 w-20 rounded-full bg-white/[0.05]" />
            </div>
          </header>

          <div className="mt-8 space-y-3">
            {[92, 100, 84, 96, 70, 0, 100, 88, 94, 60].map((w, i) =>
              w === 0 ? (
                <div key={i} className="h-6" />
              ) : (
                <div key={i} className="h-3 rounded-full bg-white/[0.045]" style={{ width: `${w}%` }} />
              ),
            )}
          </div>
          <div className="mt-8 h-40 rounded-xl border border-white/[0.06] bg-ink-950/40" />
        </article>

        <aside className="hidden lg:block">
          <div className="space-y-4">
            <div className="panel h-20 p-4" />
            <div className="panel p-4">
              <div className="h-2.5 w-24 rounded-full bg-white/[0.05]" />
              <div className="mt-4 space-y-2.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-2.5 w-full rounded-full bg-white/[0.04]" />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
