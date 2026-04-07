"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PullToRefreshOptions {
  /** Callback when user pulls to refresh */
  onRefresh: () => Promise<void>;
  /** Pull distance in pixels to trigger refresh (default: 80) */
  threshold?: number;
}

/**
 * Pull-to-refresh hook for mobile.
 * Returns a ref to attach to the scrollable container and the current state.
 */
export function usePullToRefresh<T extends HTMLElement = HTMLElement>({
  onRefresh,
  threshold = 80,
}: PullToRefreshOptions) {
  const ref = useRef<T>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const pulling = useRef(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      // Only activate when scrolled to top
      if (el!.scrollTop <= 0) {
        touchStartY.current = touch.clientY;
        pulling.current = true;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!pulling.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const delta = touch.clientY - touchStartY.current;
      if (delta > 0) {
        // Apply resistance — pull distance grows slower than finger movement
        const distance = Math.min(delta * 0.5, threshold * 1.5);
        setPullDistance(distance);
        setIsPulling(true);
      } else {
        pulling.current = false;
        setPullDistance(0);
        setIsPulling(false);
      }
    }

    function handleTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      setIsPulling(false);

      if (pullDistance >= threshold) {
        void handleRefresh();
      } else {
        setPullDistance(0);
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleRefresh, pullDistance, threshold]);

  return {
    ref,
    isPulling,
    isRefreshing,
    pullDistance,
    /** Style to apply to the pull indicator */
    pullIndicatorStyle: {
      transform: `translateY(${pullDistance}px)`,
      opacity: Math.min(pullDistance / threshold, 1),
      transition: isPulling ? "none" : "transform 0.3s ease, opacity 0.3s ease",
    } as React.CSSProperties,
  };
}
