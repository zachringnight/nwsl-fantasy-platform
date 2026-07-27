"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
}

const REVEAL_FALLBACK_MS = 2000;

export function ScrollReveal({ children, className }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let fallbackId: number | undefined;

    const reveal = (activeObserver?: IntersectionObserver) => {
      el.classList.remove("is-pending");
      el.classList.add("is-visible");

      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
        fallbackId = undefined;
      }

      activeObserver?.unobserve(el);
    };

    if (
      prefersReducedMotion ||
      typeof window.IntersectionObserver !== "function" ||
      el.classList.contains("is-visible")
    ) {
      reveal();
      return;
    }

    // Content is visible in the server-rendered HTML. Only enhance it into a
    // pending reveal after hydration and after confirming the browser supports
    // the observer needed to reveal it again.
    el.classList.add("is-pending");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          reveal(observer);
        }
      },
      {
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.12,
      }
    );

    observer.observe(el);
    fallbackId = window.setTimeout(() => reveal(observer), REVEAL_FALLBACK_MS);

    return () => {
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
      }
      observer.disconnect();
    };
  }, [prefersReducedMotion]);

  return (
    <div ref={ref} className={cn("scroll-reveal", className)}>
      {children}
    </div>
  );
}
