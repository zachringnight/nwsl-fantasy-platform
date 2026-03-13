import { cn } from "@/lib/utils";

export interface StatusBannerProps {
  title: string;
  message: string;
  tone?: "info" | "success" | "warning";
}

const toneClasses: Record<NonNullable<StatusBannerProps["tone"]>, string> = {
  info: "border-info/25 bg-info/8 text-foreground",
  success: "border-success/25 bg-success/10 text-foreground",
  warning: "border-warning/25 bg-accent-soft text-foreground",
};

export function StatusBanner({
  title,
  message,
  tone = "info",
}: StatusBannerProps) {
  return (
    <div className={cn("glass-card edge-field rounded-[1.35rem] border px-4 py-3", toneClasses[tone])}>
      <div className="relative z-10">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
          {title}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
      </div>
    </div>
  );
}
