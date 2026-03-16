import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MotionReveal } from "./motion-reveal";

describe("MotionReveal", () => {
  it("renders children", () => {
    render(<MotionReveal><p>Hello</p></MotionReveal>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies motion-reveal class", () => {
    const { container } = render(<MotionReveal>Content</MotionReveal>);
    expect(container.firstElementChild?.className).toContain("motion-reveal");
  });

  it("sets default variant to up", () => {
    const { container } = render(<MotionReveal>Content</MotionReveal>);
    expect(container.firstElementChild?.getAttribute("data-motion-variant")).toBe("up");
  });

  it("sets custom variant", () => {
    const { container } = render(<MotionReveal variant="left">Content</MotionReveal>);
    expect(container.firstElementChild?.getAttribute("data-motion-variant")).toBe("left");
  });

  it("sets default emphasis", () => {
    const { container } = render(<MotionReveal>Content</MotionReveal>);
    expect(container.firstElementChild?.getAttribute("data-motion-emphasis")).toBe("default");
  });

  it("sets live emphasis", () => {
    const { container } = render(<MotionReveal emphasis="live">Content</MotionReveal>);
    expect(container.firstElementChild?.getAttribute("data-motion-emphasis")).toBe("live");
  });

  it("sets delay via CSS custom property", () => {
    const { container } = render(<MotionReveal delay={200}>Content</MotionReveal>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue("--motion-delay")).toBe("200ms");
  });

  it("merges custom className", () => {
    const { container } = render(<MotionReveal className="fade-in">Content</MotionReveal>);
    expect(container.firstElementChild?.className).toContain("fade-in");
  });
});
