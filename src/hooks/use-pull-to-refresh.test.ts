import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { usePullToRefresh } from "./use-pull-to-refresh";

describe("usePullToRefresh", () => {
  it("returns initial state", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh })
    );

    expect(result.current.isPulling).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it("returns a ref object", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh })
    );
    expect(result.current.ref).toHaveProperty("current");
  });

  it("returns pull indicator style", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh })
    );

    const style = result.current.pullIndicatorStyle;
    expect(style).toHaveProperty("transform");
    expect(style).toHaveProperty("opacity");
    expect(style).toHaveProperty("transition");
  });

  it("initial pull indicator has zero transform", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh })
    );

    expect(result.current.pullIndicatorStyle.transform).toBe("translateY(0px)");
    expect(result.current.pullIndicatorStyle.opacity).toBe(0);
  });

  it("accepts custom threshold", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 120 })
    );
    expect(result.current.pullDistance).toBe(0);
  });
});
