import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnimatedScore } from "./animated-score";

describe("AnimatedScore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the formatted value with default decimals", () => {
    render(<AnimatedScore value={12.345} />);
    expect(screen.getByText("12.3")).toBeInTheDocument();
  });

  it("renders with custom decimal places", () => {
    render(<AnimatedScore value={5.678} decimals={2} />);
    expect(screen.getByText("5.68")).toBeInTheDocument();
  });

  it("renders zero decimals", () => {
    render(<AnimatedScore value={42} decimals={0} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("applies pop animation class when value changes", () => {
    const { rerender, container } = render(<AnimatedScore value={10} />);
    const span = container.querySelector("span")!;
    expect(span.className).not.toContain("score-pop");

    rerender(<AnimatedScore value={15} />);
    expect(container.querySelector("span")!.className).toContain("score-pop");
  });

  it("removes pop class after timeout", () => {
    const { rerender, container } = render(<AnimatedScore value={10} />);
    rerender(<AnimatedScore value={20} />);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(container.querySelector("span")!.className).not.toContain("score-pop");
  });

  it("does not pop when value stays the same", () => {
    const { rerender, container } = render(<AnimatedScore value={10} />);
    rerender(<AnimatedScore value={10} />);
    expect(container.querySelector("span")!.className).not.toContain("score-pop");
  });

  it("merges custom className", () => {
    const { container } = render(<AnimatedScore value={5} className="text-xl" />);
    expect(container.querySelector("span")!.className).toContain("text-xl");
  });
});
