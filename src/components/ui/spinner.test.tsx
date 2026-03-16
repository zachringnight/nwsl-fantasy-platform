import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("renders an SVG element", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("has spin animation class", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg?.className.baseVal).toContain("animate-spin");
  });

  it("merges custom className", () => {
    const { container } = render(<Spinner className="size-8" />);
    const svg = container.querySelector("svg");
    expect(svg?.className.baseVal).toContain("size-8");
  });

  it("contains circle and path elements", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("circle")).toBeInTheDocument();
    expect(container.querySelector("path")).toBeInTheDocument();
  });
});
