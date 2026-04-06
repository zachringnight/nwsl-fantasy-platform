import { cn } from "@/lib/utils";

interface StatComparisonBarProps {
  label: string;
  homeValue: number;
  awayValue: number;
  format?: (v: number) => string;
  className?: string;
}

export function StatComparisonBar({
  label,
  homeValue,
  awayValue,
  format = (v) => String(v),
  className,
}: StatComparisonBarProps) {
  const total = homeValue + awayValue || 1;
  const homePct = (homeValue / total) * 100;
  const awayPct = (awayValue / total) * 100;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono text-foreground">{format(homeValue)}</span>
        <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
        <span className="font-mono text-foreground">{format(awayValue)}</span>
      </div>
      <div className="flex h-1.5 gap-1">
        <div className="flex-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-brand-strong transition-all"
            style={{ width: `${homePct}%`, marginLeft: "auto" }}
          />
        </div>
        <div className="flex-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${awayPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
