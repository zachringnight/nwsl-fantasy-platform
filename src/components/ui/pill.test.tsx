import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Pill } from "./pill";

describe("Pill", () => {
  it("renders children text", () => {
    render(<Pill>Draft ready</Pill>);
    expect(screen.getByText("Draft ready")).toBeInTheDocument();
  });

  it("applies default tone classes", () => {
    const { container } = render(<Pill>Default</Pill>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("border-line");
    expect(span?.className).toContain("text-muted");
  });

  it("applies brand tone", () => {
    const { container } = render(<Pill tone="brand">Brand</Pill>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-brand-strong");
  });

  it("applies accent tone", () => {
    const { container } = render(<Pill tone="accent">Accent</Pill>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-white");
  });

  it("applies success tone", () => {
    const { container } = render(<Pill tone="success">Success</Pill>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-brand-lime");
  });

  it("merges custom className", () => {
    const { container } = render(<Pill className="extra-cls">Test</Pill>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("extra-cls");
  });

  it("renders complex children", () => {
    render(
      <Pill>
        <span data-testid="icon">*</span>
        Label
      </Pill>
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Label")).toBeInTheDocument();
  });
});
