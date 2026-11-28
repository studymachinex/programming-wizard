import Link from "next/link";
import {
  Boxes,
  Braces,
  Cloud,
  Coffee,
  Compass,
  Container,
  Database,
  Layers,
  Leaf,
  Network,
  Radio,
  Server,
  Sparkles,
  Target,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  coffee: Coffee,
  braces: Braces,
  boxes: Boxes,
  network: Network,
  database: Database,
  leaf: Leaf,
  radio: Radio,
  server: Server,
  layers: Layers,
  cloud: Cloud,
  compass: Compass,
  target: Target,
  sparkles: Sparkles,
  waypoints: Waypoints,
  container: Container,
};

export function TrackIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = icons[icon] ?? Sparkles;
  return <Icon className={className} />;
}

export const accents: Record<
  string,
  { text: string; bg: string; border: string; dot: string; gradient: string; soft: string }
> = {
  arcane: {
    text: "text-arcane-300",
    bg: "bg-arcane-500/10",
    border: "border-arcane-400/20",
    dot: "bg-arcane-400",
    gradient: "from-arcane-500 to-mana",
    soft: "from-arcane-500/[0.12] to-transparent",
  },
  mana: {
    text: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-400/20",
    dot: "bg-cyan-400",
    gradient: "from-cyan-500 to-arcane-400",
    soft: "from-cyan-500/[0.10] to-transparent",
  },
  rune: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/20",
    dot: "bg-emerald-400",
    gradient: "from-emerald-500 to-cyan-400",
    soft: "from-emerald-500/[0.10] to-transparent",
  },
  ember: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-400/20",
    dot: "bg-amber-400",
    gradient: "from-amber-500 to-rose-400",
    soft: "from-amber-500/[0.10] to-transparent",
  },
  rose: {
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-400/20",
    dot: "bg-rose-400",
    gradient: "from-rose-500 to-arcane-400",
    soft: "from-rose-500/[0.10] to-transparent",
  },
};

export function accentOf(name: string) {
  return accents[name] ?? accents.arcane;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.08]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-zinc-400 sm:text-[15px]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "arcane",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  const a = accentOf(accent);
  return (
    <div className="panel glass-hover relative overflow-hidden p-5">
      <div className={cn("absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-60", a.soft)} />
      <div className="relative flex items-start justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        {icon && (
          <span className={cn("rounded-lg border p-1.5", a.bg, a.border, a.text)}>{icon}</span>
        )}
      </div>
      <p className="stat-value relative mt-3">{value}</p>
      {hint && <p className="relative mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    fundamento: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    intermediario: "border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300",
    avancado: "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
    especialista: "border-rose-400/20 bg-rose-400/[0.07] text-rose-300",
  };
  const labels: Record<string, string> = {
    fundamento: "Fundamento",
    intermediario: "Intermediário",
    avancado: "Avançado",
    especialista: "Especialista",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        map[level] ?? map.fundamento
      )}
    >
      {labels[level] ?? level}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-arcane-400/20 bg-arcane-500/10 text-arcane-300">
        {icon ?? <Sparkles className="h-5 w-5" />}
      </div>
      <h3 className="text-base font-medium text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-zinc-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  gradient,
}: {
  value: number;
  className?: string;
  gradient?: string;
}) {
  return (
    <div className={cn("progress-track", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", gradient ?? "from-arcane-500 via-arcane-400 to-mana")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-zinc-800">/</span>}
          {item.href ? (
            <Link href={item.href} className="transition-colors hover:text-arcane-300">
              {item.label}
            </Link>
          ) : (
            <span className="text-zinc-400">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function SectionTitle({
  label,
  title,
  href,
  linkLabel = "Ver tudo",
}: {
  label?: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        {label && <p className="eyebrow mb-1.5">{label}</p>}
        <h2 className="text-[17px] font-semibold tracking-tight text-white">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="text-[11.5px] text-zinc-500 transition-colors hover:text-arcane-300">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
