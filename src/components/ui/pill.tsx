import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.24em]",
  {
    variants: {
      tone: {
        default: "border-line bg-white/6 text-muted",
        brand: "border-brand-strong/25 bg-brand/15 text-brand-strong",
        accent: "border-accent/30 bg-accent-soft text-white",
        success: "border-success/30 bg-success/12 text-brand-lime",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
);

export interface PillProps extends VariantProps<typeof pillVariants> {
  children: ReactNode;
  className?: string;
}

export function Pill({ children, className, tone }: PillProps) {
  return <span className={cn(pillVariants({ tone }), className)}>{children}</span>;
}
