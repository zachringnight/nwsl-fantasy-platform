import type { ReactNode } from "react";
import { SectionHeading } from "@/components/common/section-heading";

export interface AppShellProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: AppShellProps) {
  return (
    <main className="page-shell space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="glass-card edge-field surface-ring overflow-hidden rounded-[2.25rem] border border-line bg-panel-strong px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="subtle-grid absolute inset-0 opacity-20" />
        <div className="brand-strip absolute inset-x-0 top-0 h-1.5 opacity-95" />
        <div className="accent-strip absolute inset-x-[34%] bottom-0 h-1 opacity-80" />
        <div className="edge-frame absolute inset-0 opacity-70" />
        <div className="relative z-10">
          <SectionHeading
            eyebrow={eyebrow}
            title={title}
            description={description}
            action={actions}
          />
        </div>
      </section>
      <div className="hero-grid">{children}</div>
    </main>
  );
}
