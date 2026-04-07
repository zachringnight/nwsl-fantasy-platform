"use client";

import { useRef, useCallback, useEffect } from "react";

interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface SwipeOptions {
  /** Minimum distance in pixels to count as a swipe (default: 50) */
  threshold?: number;
  /** Maximum time in ms for the swipe gesture (default: 300) */
  maxTime?: number;
}

/**
 * Hook that attaches touch swipe detection to a ref'd element.
 * Returns a ref to attach to the swipeable container.
 */
export function useSwipe<T extends HTMLElement = HTMLElement>(
  callbacks: SwipeCallbacks,
  options: SwipeOptions = {}
) {
  const { threshold = 50, maxTime = 300 } = options;
  const ref = useRef<T>(null);
  const touchState = useRef<{
    startX: number;
    startY: number;
    startTime: number;
  } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchState.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const { startX, startY, startTime } = touchState.current;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const elapsed = Date.now() - startTime;

      touchState.current = null;

      if (elapsed > maxTime) return;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Require dominant axis to be at least 1.5x the other
      if (absX > absY && absX >= threshold) {
        if (deltaX > 0) callbacks.onSwipeRight?.();
        else callbacks.onSwipeLeft?.();
      } else if (absY > absX && absY >= threshold) {
        if (deltaY > 0) callbacks.onSwipeDown?.();
        else callbacks.onSwipeUp?.();
      }
    },
    [callbacks, threshold, maxTime]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  return ref;
}
