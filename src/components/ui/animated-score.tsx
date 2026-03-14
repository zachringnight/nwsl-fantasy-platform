"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedScoreProps {
  value: number;
  className?: string;
  decimals?: number;
}

export function AnimatedScore({ value, className, decimals = 1 }: AnimatedScoreProps) {
  const [popping, setPopping] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      setPopping(true);
      prevValue.current = value;
      const timer = setTimeout(() => setPopping(false), 400);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span className={cn(popping && "score-pop", className)}>
      {value.toFixed(decimals)}
    </span>
  );
}
