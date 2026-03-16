import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton, SkeletonCard, SkeletonRow } from "./skeleton";

describe("Skeleton", () => {
  it("renders a div with aria-hidden", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe("DIV");
    expect(el?.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies shimmer class", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.className).toContain("skeleton-shimmer");
  });

  it("merges custom className", () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("h-4");
    expect(el?.className).toContain("w-24");
  });
});

describe("SkeletonCard", () => {
  it("renders multiple skeleton elements", () => {
    const { container } = render(<SkeletonCard />);
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it("has a container with border styling", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstElementChild?.className).toContain("border");
  });
});

describe("SkeletonRow", () => {
  it("renders skeleton elements in a row layout", () => {
    const { container } = render(<SkeletonRow />);
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it("has flex layout", () => {
    const { container } = render(<SkeletonRow />);
    expect(container.firstElementChild?.className).toContain("flex");
  });
});
