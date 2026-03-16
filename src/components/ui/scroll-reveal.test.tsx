import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScrollReveal } from "./scroll-reveal";

const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  mockObserve.mockClear();
  mockUnobserve.mockClear();
  mockDisconnect.mockClear();

  // Use a class so `new IntersectionObserver(...)` works
  const MockIntersectionObserver = class {
    constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
    observe = mockObserve;
    unobserve = mockUnobserve;
    disconnect = mockDisconnect;
    takeRecords = vi.fn().mockReturnValue([]);
    root = null;
    rootMargin = "";
    thresholds = [0];
  };

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

describe("ScrollReveal", () => {
  it("renders children", () => {
    render(<ScrollReveal><p>Visible content</p></ScrollReveal>);
    expect(screen.getByText("Visible content")).toBeInTheDocument();
  });

  it("applies scroll-reveal class", () => {
    const { container } = render(<ScrollReveal>Content</ScrollReveal>);
    expect(container.firstElementChild?.className).toContain("scroll-reveal");
  });

  it("merges custom className", () => {
    const { container } = render(<ScrollReveal className="mt-8">Content</ScrollReveal>);
    expect(container.firstElementChild?.className).toContain("mt-8");
  });

  it("observes the element", () => {
    render(<ScrollReveal>Content</ScrollReveal>);
    expect(mockObserve).toHaveBeenCalled();
  });
});
