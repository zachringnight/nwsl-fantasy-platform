import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type MotionRevealVariant = "up" | "left" | "right" | "scale";
type MotionRevealEmphasis = "default" | "live";

export interface MotionRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  emphasis?: MotionRevealEmphasis;
  variant?: MotionRevealVariant;
}

export function MotionReveal({
  children,
  className,
  delay = 0,
  emphasis = "default",
  variant = "up",
}: MotionRevealProps) {
  return (
    <div
      className={cn("motion-reveal", className)}
      data-motion-emphasis={emphasis}
      data-motion-variant={variant}
      style={{ "--motion-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
