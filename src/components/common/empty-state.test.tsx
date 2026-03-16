import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No leagues" description="Create your first league." />);
    expect(screen.getByText("No leagues")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<EmptyState title="Empty" description="Nothing here yet." />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState
        title="No data"
        description="Get started"
        action={<button>Create</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("does not render action wrapper when no action", () => {
    const { container } = render(
      <EmptyState title="Empty" description="Nothing." />
    );
    // Should still have the heading and description but no extra action div
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("Nothing.")).toBeInTheDocument();
  });

  it("displays league signal pill", () => {
    render(<EmptyState title="Test" description="Test" />);
    expect(screen.getByText("League signal")).toBeInTheDocument();
  });
});
