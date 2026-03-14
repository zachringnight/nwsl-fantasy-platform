import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

export interface GuidedLeagueStateStep {
  label: string;
  detail: string;
}

export interface GuidedLeagueStateProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: string;
  className?: string;
  highlights?: string[];
  icon?: LucideIcon;
  steps?: GuidedLeagueStateStep[];
  tone?: "default" | "brand" | "accent";
}

const toneClassName: Record<NonNullable<GuidedLeagueStateProps["tone"]>, string> = {
  default:
    "border-line bg-[linear-gradient(145deg,rgba(8,13,36,0.96)_0%,rgba(5,10,26,0.98)_100%)]",
  brand:
    "border-brand-strong/22 bg-[linear-gradient(135deg,rgba(255,126,182,0.16)_0%,rgba(5,34,255,0.32)_36%,rgba(3,6,20,0.98)_100%)]",
  accent:
    "border-accent/28 bg-[linear-gradient(135deg,rgba(255,197,128,0.14)_0%,rgba(14,20,58,0.96)_34%,rgba(2,6,20,0.98)_100%)]",
};

export function GuidedLeagueState({
  eyebrow,
  title,
  description,
  actions,
  badge = "Next move",
  className,
  highlights = [],
  icon: Icon = Sparkles,
  steps = [],
  tone = "brand",
}: GuidedLeagueStateProps) {
  const previewHighlights =
    highlights.length > 0 ? highlights.slice(0, 3) : ["Quick reset", "Visual guide", "One clear CTA"];

  return (
    <section
      className={cn(
        "guided-state-shell glass-card edge-field overflow-hidden rounded-[2.2rem] border p-5 shadow-[0_28px_80px_rgba(0,0,0,0.36)] sm:p-6 lg:p-7",
        toneClassName[tone],
        className
      )}
    >
      <div className="guided-state-orb guided-state-orb-rose" />
      <div className="guided-state-orb guided-state-orb-cyan" />

      <div className="relative z-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="guided-state-illustration">
          <div className="guided-state-poster">
            <Pill tone="brand" className="border-white/14 bg-white/10 text-white">
              {badge}
            </Pill>

            <div className="guided-state-icon-wrap">
              <span className="guided-state-icon-core">
                <Icon className="size-8" />
              </span>
            </div>

            <div className="space-y-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-white/78">
                {eyebrow}
              </p>
              <div className="flex flex-wrap gap-2">
                {previewHighlights.map((highlight) => (
                  <span key={highlight} className="guided-state-token">
                    {highlight}
                  </span>
                ))}
              </div>
            </div>

            <div className="guided-state-ribbons" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-3">
            <Pill tone="accent" className="border-white/10 bg-white/8 text-white">
              {eyebrow}
            </Pill>
            <div className="space-y-2">
              <h2 className="font-display text-[2.9rem] uppercase leading-[0.88] tracking-[0.01em] text-white sm:text-[3.4rem]">
                {title}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-white/76 sm:text-base">
                {description}
              </p>
            </div>
          </div>

          {steps.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {steps.map((step, index) => (
                <article key={step.label} className="guided-state-step">
                  <span className="guided-state-step-index">
                    0{index + 1}
                    <ArrowUpRight className="size-3" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-white">{step.label}</p>
                  <p className="mt-2 text-sm leading-6 text-white/78">{step.detail}</p>
                </article>
              ))}
            </div>
          ) : null}

          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
