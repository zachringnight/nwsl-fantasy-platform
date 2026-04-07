"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedScoreProps {
  value: number;
  className?: string;
  decimals?: number;
}

export function AnimatedScore({ value, className, decimals = 1 }: AnimatedScoreProps) {
  const prevValue = useRef(value);
  const scoreRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (prevValue.current === value || !scoreRef.current) {
      return;
    }

    prevValue.current = value;

    const element = scoreRef.current;
    element.classList.remove("score-pop");
    void element.offsetWidth;
    element.classList.add("score-pop");

    const timer = window.setTimeout(() => {
      element.classList.remove("score-pop");
    }, 400);

    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span ref={scoreRef} className={cn(className)}>
      {value.toFixed(decimals)}
    </span>
  );
}
