import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollReveal } from "./scroll-reveal";

const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();
let observerCallback: IntersectionObserverCallback;

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

beforeEach(() => {
  mockObserve.mockClear();
  mockUnobserve.mockClear();
  mockDisconnect.mockClear();
  stubMotionPreference(false);

  const MockIntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
    observe = mockObserve;
    unobserve = mockUnobserve;
    disconnect = mockDisconnect;
    takeRecords = vi.fn().mockReturnValue([]);
    root = null;
    rootMargin = "";
    thresholds = [0.12];
  };

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ScrollReveal", () => {
  it("renders visible server markup without a JavaScript-only pending state", () => {
    const markup = renderToStaticMarkup(
      <ScrollReveal>
        <p>Visible content</p>
      </ScrollReveal>
    );

    expect(markup).toContain('class="scroll-reveal"');
    expect(markup).not.toContain("is-pending");
  });

  it("renders children and merges a custom className", () => {
    const { container } = render(
      <ScrollReveal className="mt-8">
        <p>Visible content</p>
      </ScrollReveal>
    );

    expect(screen.getByText("Visible content")).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain("scroll-reveal");
    expect(container.firstElementChild?.className).toContain("mt-8");
  });

  it("observes a supported full-motion reveal and reveals it once intersecting", () => {
    const { container } = render(<ScrollReveal>Content</ScrollReveal>);
    const element = container.firstElementChild as HTMLDivElement;

    expect(element).toHaveClass("is-pending");
    expect(mockObserve).toHaveBeenCalledWith(element);

    act(() => {
      observerCallback(
        [
          {
            isIntersecting: true,
            target: element,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );
    });

    expect(element).toHaveClass("is-visible");
    expect(element).not.toHaveClass("is-pending");
    expect(mockUnobserve).toHaveBeenCalledWith(element);
  });

  it("leaves content visible when IntersectionObserver is unsupported", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<ScrollReveal>Content</ScrollReveal>);
    const element = container.firstElementChild;

    expect(element).toHaveClass("is-visible");
    expect(element).not.toHaveClass("is-pending");
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it("leaves content visible when reduced motion is preferred", () => {
    stubMotionPreference(true);
    const { container } = render(<ScrollReveal>Content</ScrollReveal>);
    const element = container.firstElementChild;

    expect(element).toHaveClass("is-visible");
    expect(element).not.toHaveClass("is-pending");
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it("uses a bounded fallback if the observer never reports an intersection", () => {
    vi.useFakeTimers();
    const { container } = render(<ScrollReveal>Content</ScrollReveal>);
    const element = container.firstElementChild;

    expect(element).toHaveClass("is-pending");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(element).toHaveClass("is-visible");
    expect(element).not.toHaveClass("is-pending");
    expect(mockUnobserve).toHaveBeenCalled();
  });

  it("disconnects its observer on unmount", () => {
    const { unmount } = render(<ScrollReveal>Content</ScrollReveal>);
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
