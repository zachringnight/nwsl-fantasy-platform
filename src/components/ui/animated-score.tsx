"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedScoreProps {
  value: number;
  className?: string;
  decimals?: number;
}

export function AnimatedScore({
  value,
  className,
  decimals = 1,
}: AnimatedScoreProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (previousValueRef.current === value || !elementRef.current) return;

    previousValueRef.current = value;
    const element = elementRef.current;
    element.classList.add("score-pop");
    const timer = window.setTimeout(() => {
      element.classList.remove("score-pop");
    }, 400);

    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span ref={elementRef} className={cn(className)}>
      {value.toFixed(decimals)}
    </span>
  );
}
