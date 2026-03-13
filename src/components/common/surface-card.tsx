import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SurfaceCardProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  tone?: "default" | "brand" | "accent";
  className?: string;
}

const toneClassName: Record<NonNullable<SurfaceCardProps["tone"]>, string> = {
  default: "border-line bg-panel text-foreground",
  brand:
    "border-brand/35 text-white [background:linear-gradient(120deg,#00E1FF_0%,#0522FF_34%,#121A6A_72%,#000000_100%)]",
  accent:
    "border-accent/35 text-foreground [background:linear-gradient(140deg,rgba(18,26,106,0.95)_0%,rgba(7,10,32,0.98)_58%,#000000_100%)]",
};

export function SurfaceCard({
  eyebrow,
  title,
  description,
  children,
  tone = "default",
  className,
}: SurfaceCardProps) {
  const isBrand = tone === "brand";
  const isAccent = tone === "accent";

  return (
    <article
      className={cn(
        "glass-card surface-ring rounded-[2rem] border p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 md:p-6",
        tone === "brand" ? "edge-field" : tone === "accent" ? "edge-field edge-field-accent" : "",
        toneClassName[tone],
        className
      )}
    >
      <div className="relative z-10 space-y-3">
        {eyebrow ? (
          <p
            className={cn(
              "text-[0.68rem] font-semibold uppercase tracking-[0.26em]",
              isBrand ? "text-white/70" : isAccent ? "text-[#C5FF5F]" : "text-brand-strong"
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="font-display text-4xl uppercase leading-[0.9] tracking-[0.01em] md:text-[3.2rem]">
            {title}
          </h2>
          {description ? (
            <p
              className={cn(
                "text-sm leading-6",
                isBrand ? "text-white/82" : "text-muted"
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {children ? <div className="pt-2">{children}</div> : null}
      </div>
    </article>
  );
}
