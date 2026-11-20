export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-3">
        <div className="h-3 w-32 rounded-full bg-white/[0.05]" />
        <div className="h-9 w-2/3 max-w-xl rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-1/2 max-w-md rounded-lg bg-white/[0.04]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel h-[118px] p-5">
            <div className="h-2.5 w-20 rounded-full bg-white/[0.05]" />
            <div className="mt-5 h-7 w-24 rounded-lg bg-white/[0.07]" />
            <div className="mt-3 h-2.5 w-28 rounded-full bg-white/[0.04]" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <div className="panel h-56 p-6">
            <div className="h-2.5 w-24 rounded-full bg-white/[0.05]" />
            <div className="mt-4 h-6 w-3/4 rounded-lg bg-white/[0.06]" />
            <div className="mt-3 h-3 w-1/2 rounded-full bg-white/[0.04]" />
            <div className="mt-6 h-9 w-36 rounded-xl bg-white/[0.05]" />
          </div>
          <div className="panel h-64 p-6">
            <div className="h-3 w-28 rounded-full bg-white/[0.05]" />
            <div className="mt-6 grid grid-cols-12 gap-1.5">
              {Array.from({ length: 84 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-sm bg-white/[0.035]" />
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="panel h-60 p-5">
            <div className="h-2.5 w-24 rounded-full bg-white/[0.05]" />
            <div className="mt-4 h-8 w-32 rounded-lg bg-white/[0.06]" />
            <div className="mt-4 h-1.5 w-full rounded-full bg-white/[0.04]" />
          </div>
          <div className="panel h-44 p-5">
            <div className="h-2.5 w-20 rounded-full bg-white/[0.05]" />
            <div className="mt-4 h-10 w-16 rounded-lg bg-white/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  );
}
