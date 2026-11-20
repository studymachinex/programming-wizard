import type { HeatCell } from "@/lib/data";
import { cn } from "@/lib/utils";

const levelColors = [
  "bg-white/[0.04] border-white/[0.04]",
  "bg-arcane-700/40 border-arcane-600/30",
  "bg-arcane-600/60 border-arcane-500/40",
  "bg-arcane-500/80 border-arcane-400/50",
  "bg-arcane-300 border-arcane-200/60",
];

const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  if (!cells.length) return null;
  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabels = weeks.map((week, i) => {
    const first = week[0];
    if (!first) return null;
    const date = new Date(`${first.day}T12:00:00`);
    const prev = i > 0 ? new Date(`${weeks[i - 1][0].day}T12:00:00`) : null;
    if (!prev || date.getMonth() !== prev.getMonth()) return months[date.getMonth()];
    return null;
  });

  const total = cells.reduce((sum, c) => sum + c.minutes, 0);
  const activeDays = cells.filter((c) => c.minutes > 0).length;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5">
          <div className="ml-7 flex gap-[3px]">
            {monthLabels.map((m, i) => (
              <div key={i} className="w-[13px] text-[8.5px] uppercase tracking-wide text-zinc-600">
                {m ?? ""}
              </div>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="mr-1 flex w-6 flex-col justify-between py-0.5 text-[8px] text-zinc-600">
              <span>seg</span>
              <span>qua</span>
              <span>sex</span>
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((cell) => (
                  <div
                    key={cell.day}
                    title={`${cell.day}: ${cell.minutes} min`}
                    className={cn("h-[13px] w-[13px] rounded-[3px] border", levelColors[cell.level])}
                  />
                ))}
                {week.length < 7 &&
                  Array.from({ length: 7 - week.length }).map((_, i) => (
                    <div key={`pad-${i}`} className="h-[13px] w-[13px]" />
                  ))}
              </div>
            ))}
          </div>
          <div className="ml-7 mt-1 flex items-center justify-between text-[10px] text-zinc-600">
            <span>{activeDays} dias ativos · {Math.round(total / 60)}h registradas</span>
            <span className="flex items-center gap-1">
              menos
              {levelColors.map((c, i) => (
                <span key={i} className={cn("h-[10px] w-[10px] rounded-[2px] border", c)} />
              ))}
              mais
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
