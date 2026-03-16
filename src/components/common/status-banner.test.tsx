import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBanner } from "./status-banner";

describe("StatusBanner", () => {
  it("renders title text", () => {
    render(<StatusBanner title="System update" message="We are upgrading." />);
    expect(screen.getByText("System update")).toBeInTheDocument();
  });

  it("renders message text", () => {
    render(<StatusBanner title="Info" message="All systems operational." />);
    expect(screen.getByText("All systems operational.")).toBeInTheDocument();
  });

  it("applies info tone by default", () => {
    const { container } = render(<StatusBanner title="T" message="M" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("border-info/25");
  });

  it("applies success tone", () => {
    const { container } = render(<StatusBanner title="T" message="M" tone="success" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("border-success/25");
  });

  it("applies warning tone", () => {
    const { container } = render(<StatusBanner title="T" message="M" tone="warning" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("border-warning/25");
  });
});
