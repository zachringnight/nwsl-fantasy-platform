import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SectionHeading } from "./section-heading";

describe("SectionHeading", () => {
  it("renders eyebrow text", () => {
    render(
      <SectionHeading
        eyebrow="Dashboard"
        title="Welcome"
        description="Your fantasy overview."
      />
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders title as h1", () => {
    render(
      <SectionHeading
        eyebrow="Test"
        title="Main Title"
        description="Description text."
      />
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Main Title");
  });

  it("renders description", () => {
    render(
      <SectionHeading
        eyebrow="Test"
        title="Title"
        description="A detailed description."
      />
    );
    expect(screen.getByText("A detailed description.")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <SectionHeading
        eyebrow="Test"
        title="Title"
        description="Desc"
        action={<button>Action</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });

  it("does not render action wrapper when no action", () => {
    const { container } = render(
      <SectionHeading eyebrow="E" title="T" description="D" />
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
