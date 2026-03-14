import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "default" | "brand" | "accent";
  className?: string;
}

const toneClassNames: Record<NonNullable<MetricTileProps["tone"]>, string> = {
  default: "border-line bg-white/6 text-foreground",
  brand:
    "border-brand/30 bg-[linear-gradient(135deg,rgba(0,225,255,0.12)_0%,rgba(5,34,255,0.28)_48%,rgba(2,7,22,0.94)_100%)] text-white",
  accent:
    "border-accent/30 bg-[linear-gradient(135deg,rgba(255,60,34,0.14)_0%,rgba(18,26,106,0.82)_46%,rgba(2,7,22,0.96)_100%)] text-white",
};

export function MetricTile({
  className,
  detail,
  label,
  tone = "default",
  value,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        "glass-card kinetic-hover rounded-[1.4rem] border p-4 backdrop-blur-xl",
        toneClassNames[tone],
        className
      )}
    >
      <div className="relative z-10 space-y-2">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
          {label}
        </p>
        <p className="text-[clamp(1.4rem,4vw,1.9rem)] font-semibold leading-none tracking-[-0.04em]">{value}</p>
        {detail ? <p className="text-sm leading-6 text-muted">{detail}</p> : null}
      </div>
    </div>
  );
}
