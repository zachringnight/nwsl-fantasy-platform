import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ConfettiBurst } from "./confetti-burst";

describe("ConfettiBurst", () => {
  it("renders a canvas element", () => {
    const { container } = render(<ConfettiBurst active={false} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<ConfettiBurst active={false} />);
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
  });

  it("has pointer-events-none for non-interactive overlay", () => {
    const { container } = render(<ConfettiBurst active={false} />);
    const canvas = container.querySelector("canvas");
    expect(canvas?.className).toContain("pointer-events-none");
  });

  it("starts with display none", () => {
    const { container } = render(<ConfettiBurst active={false} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.style.display).toBe("none");
  });

  it("has fixed positioning for overlay", () => {
    const { container } = render(<ConfettiBurst active={false} />);
    const canvas = container.querySelector("canvas");
    expect(canvas?.className).toContain("fixed");
  });
});
