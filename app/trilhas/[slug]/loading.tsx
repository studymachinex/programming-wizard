// Fallback instantâneo ao abrir uma trilha a partir de /trilhas. Sem ele a navegação
// fica "parada" até o RSC chegar (1–2 s com cache frio), e o clique parece perdido.
export default function TrackLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-5 h-3 w-40 rounded-full bg-white/[0.05]" />

      <section className="rounded-3xl border border-white/[0.07] bg-ink-850/80 p-6 shadow-card sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <div className="h-11 w-11 rounded-xl bg-white/[0.06]" />
              <div className="h-5 w-24 rounded-full bg-white/[0.05]" />
            </div>
            <div className="h-10 w-2/3 max-w-xl rounded-xl bg-white/[0.07]" />
            <div className="mt-3 h-4 w-1/2 max-w-md rounded-lg bg-white/[0.05]" />
            <div className="mt-3 h-3 w-3/4 max-w-2xl rounded-full bg-white/[0.04]" />
            <div className="mt-6 flex gap-2.5">
              <div className="h-10 w-40 rounded-xl bg-white/[0.07]" />
              <div className="h-10 w-32 rounded-xl bg-white/[0.05]" />
            </div>
          </div>
          <div className="h-48 rounded-2xl border border-white/[0.07] bg-ink-950/40" />
        </div>
      </section>

      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel h-20 p-5">
            <div className="h-3 w-48 rounded-full bg-white/[0.06]" />
            <div className="mt-3 h-2.5 w-72 max-w-full rounded-full bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}
