import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfettiBurst } from "./confetti-burst";

function stubMotionPreference(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ConfettiBurst", () => {
  it("renders an inert, hidden canvas overlay", () => {
    const { container } = render(<ConfettiBurst active={false} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    expect(canvas).toBeInTheDocument();
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(canvas.className).toContain("pointer-events-none");
    expect(canvas.className).toContain("fixed");
    expect(canvas.style.display).toBe("none");
  });

  it("suppresses canvas work when reduced motion is preferred", () => {
    stubMotionPreference(true);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const requestFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);

    const { container } = render(<ConfettiBurst active />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    expect(canvas.style.display).toBe("none");
    expect(getContext).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("runs an allowed burst through its final animation frame", () => {
    stubMotionPreference(false);

    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      restore: vi.fn(),
      rotate: vi.fn(),
      save: vi.fn(),
      translate: vi.fn(),
      globalAlpha: 1,
      fillStyle: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(performance, "now").mockReturnValue(0);

    let frameCallback: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { container } = render(<ConfettiBurst active duration={1000} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    expect(canvas.style.display).toBe("block");
    expect(requestFrame).toHaveBeenCalledTimes(1);

    act(() => {
      frameCallback?.(1000);
    });

    expect(canvas.style.display).toBe("none");
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });
});
