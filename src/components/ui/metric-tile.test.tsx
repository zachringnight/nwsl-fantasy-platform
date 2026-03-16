import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MetricTile } from "./metric-tile";

describe("MetricTile", () => {
  it("renders label text", () => {
    render(<MetricTile label="Total Points" value={120} />);
    expect(screen.getByText("Total Points")).toBeInTheDocument();
  });

  it("renders value", () => {
    render(<MetricTile label="Score" value="98.5" />);
    expect(screen.getByText("98.5")).toBeInTheDocument();
  });

  it("renders detail when provided", () => {
    render(<MetricTile label="Rank" value={3} detail="Top 10%" />);
    expect(screen.getByText("Top 10%")).toBeInTheDocument();
  });

  it("does not render detail when not provided", () => {
    const { container } = render(<MetricTile label="Rank" value={3} />);
    const paragraphs = container.querySelectorAll("p");
    // Should have label and value paragraphs only
    expect(paragraphs).toHaveLength(2);
  });

  it("applies default tone", () => {
    const { container } = render(<MetricTile label="L" value="V" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("border-line");
  });

  it("applies brand tone", () => {
    const { container } = render(<MetricTile label="L" value="V" tone="brand" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("border-brand/30");
  });

  it("applies accent tone", () => {
    const { container } = render(<MetricTile label="L" value="V" tone="accent" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("border-accent/30");
  });

  it("merges custom className", () => {
    const { container } = render(<MetricTile label="L" value="V" className="col-span-2" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("col-span-2");
  });

  it("accepts ReactNode as value", () => {
    render(<MetricTile label="Score" value={<strong>99</strong>} />);
    expect(screen.getByText("99")).toBeInTheDocument();
  });
});
