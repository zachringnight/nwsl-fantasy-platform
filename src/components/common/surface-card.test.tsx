import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SurfaceCard } from "./surface-card";

describe("SurfaceCard", () => {
  it("renders title as h2", () => {
    render(<SurfaceCard title="My Card" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("My Card");
  });

  it("renders eyebrow when provided", () => {
    render(<SurfaceCard eyebrow="Category" title="Card" />);
    expect(screen.getByText("Category")).toBeInTheDocument();
  });

  it("does not render eyebrow when not provided", () => {
    const { container } = render(<SurfaceCard title="Card" />);
    // Should only have title, no eyebrow paragraph
    const allText = container.textContent;
    expect(allText).toBe("Card");
  });

  it("renders description when provided", () => {
    render(<SurfaceCard title="Card" description="Some details here." />);
    expect(screen.getByText("Some details here.")).toBeInTheDocument();
  });

  it("renders children when provided", () => {
    render(
      <SurfaceCard title="Card">
        <p>Child content</p>
      </SurfaceCard>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("renders as article element", () => {
    render(<SurfaceCard title="Card" />);
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("applies default tone", () => {
    const { container } = render(<SurfaceCard title="Card" />);
    const article = container.querySelector("article");
    expect(article?.className).toContain("border-line");
    expect(article?.className).toContain("bg-panel");
  });

  it("applies brand tone", () => {
    const { container } = render(<SurfaceCard title="Card" tone="brand" />);
    const article = container.querySelector("article");
    expect(article?.className).toContain("border-brand/35");
  });

  it("applies accent tone", () => {
    const { container } = render(<SurfaceCard title="Card" tone="accent" />);
    const article = container.querySelector("article");
    expect(article?.className).toContain("border-accent/35");
  });

  it("merges custom className", () => {
    const { container } = render(<SurfaceCard title="Card" className="p-8" />);
    const article = container.querySelector("article");
    expect(article?.className).toContain("p-8");
  });
});
