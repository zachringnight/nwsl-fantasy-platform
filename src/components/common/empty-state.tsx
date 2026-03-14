import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Pill } from "@/components/ui/pill";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state-shell glass-card edge-field surface-ring overflow-hidden rounded-[2rem] border border-dashed border-line bg-panel p-6 text-center backdrop-blur-xl sm:p-7">
      <div className="empty-state-orb empty-state-orb-rose" />
      <div className="empty-state-orb empty-state-orb-cyan" />

      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-4">
          <Pill tone="brand" className="border-white/12 bg-white/10 text-white">
            League signal
          </Pill>

          <span className="empty-state-icon">
            <Sparkles className="size-6" />
          </span>
        </div>

        <h2 className="font-display text-4xl uppercase leading-none tracking-[0.01em] text-foreground">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-white/78">{description}</p>
        {action ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div> : null}
      </div>
    </div>
  );
}
