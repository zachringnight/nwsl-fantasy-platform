import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button, getButtonClassName } from "./button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("applies primary variant by default", () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-brand");
  });

  it("applies secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-white/7");
  });

  it("applies ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-transparent");
  });

  it("applies accent variant", () => {
    render(<Button variant="accent">Accent</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-accent");
  });

  it("applies size sm", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-4");
  });

  it("applies size lg", () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-6");
  });

  it("applies fullWidth", () => {
    render(<Button fullWidth>Full</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("w-full");
  });

  it("passes through native button attributes", () => {
    render(<Button type="submit" disabled>Submit</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("type", "submit");
  });

  it("handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("merges custom className", () => {
    render(<Button className="custom-class">Test</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("custom-class");
  });

  it("does not fire click when disabled", () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled</Button>);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe("getButtonClassName", () => {
  it("returns default class string", () => {
    const className = getButtonClassName();
    expect(className).toContain("inline-flex");
    expect(className).toContain("bg-brand");
  });

  it("accepts variant override", () => {
    const className = getButtonClassName({ variant: "ghost" });
    expect(className).toContain("bg-transparent");
  });

  it("accepts fullWidth override", () => {
    const className = getButtonClassName({ fullWidth: true });
    expect(className).toContain("w-full");
  });

  it("merges custom className", () => {
    const className = getButtonClassName({ className: "my-extra" });
    expect(className).toContain("my-extra");
  });
});
