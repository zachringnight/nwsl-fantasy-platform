import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

function PreferenceProbe() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return <span>{prefersReducedMotion ? "reduced" : "full"}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePrefersReducedMotion", () => {
  it("fails safe when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<PreferenceProbe />);
    expect(screen.getByText("reduced")).toBeInTheDocument();
  });

  it("tracks changes to the operating-system preference", () => {
    let matches = false;
    let listener: (() => void) | undefined;
    const mediaQuery = {
      get matches() {
        return matches;
      },
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn((_type: string, nextListener: () => void) => {
        listener = nextListener;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));

    render(<PreferenceProbe />);
    expect(screen.getByText("full")).toBeInTheDocument();

    act(() => {
      matches = true;
      listener?.();
    });

    expect(screen.getByText("reduced")).toBeInTheDocument();
  });
});
