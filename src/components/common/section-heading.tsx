import type { ReactNode } from "react";

export interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: SectionHeadingProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
      <div className="max-w-4xl space-y-4 section-fade">
        <p className="inline-flex rounded-full border border-brand-strong/25 bg-brand/15 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-brand-strong">
          {eyebrow}
        </p>
        <h1 className="font-display text-5xl uppercase leading-[0.88] tracking-[0.01em] text-foreground sm:text-6xl xl:text-[5.8rem]">
          {title}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted sm:text-lg">
          {description}
        </p>
      </div>
      {action ? (
        <div className="section-fade section-fade-delay-1 xl:justify-self-end">{action}</div>
      ) : null}
    </div>
  );
}
