import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LiveRegion } from "./live-region";

describe("LiveRegion", () => {
  it("renders the message text", () => {
    render(<LiveRegion message="Player scored a goal" />);
    expect(screen.getByText("Player scored a goal")).toBeInTheDocument();
  });

  it("defaults to polite aria-live", () => {
    render(<LiveRegion message="Info update" />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-live", "polite");
  });

  it("supports assertive politeness", () => {
    render(<LiveRegion message="Critical alert" politeness="assertive" />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-live", "assertive");
  });

  it("has aria-atomic true", () => {
    render(<LiveRegion message="test" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
  });

  it("is visually hidden with sr-only class", () => {
    render(<LiveRegion message="hidden" />);
    expect(screen.getByRole("status").className).toContain("sr-only");
  });

  it("updates announcement when message changes", () => {
    const { rerender } = render(<LiveRegion message="First" />);
    expect(screen.getByText("First")).toBeInTheDocument();

    rerender(<LiveRegion message="Second" />);
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});
