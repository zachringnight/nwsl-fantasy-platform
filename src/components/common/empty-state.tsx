import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="glass-card edge-field surface-ring rounded-[2rem] border border-dashed border-line bg-panel p-6 text-center backdrop-blur-xl">
      <div className="relative z-10">
        <h2 className="font-display text-4xl uppercase leading-none tracking-[0.01em] text-foreground">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
