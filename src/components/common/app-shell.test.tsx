import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders title via SectionHeading", () => {
    render(
      <AppShell eyebrow="Dashboard" title="My Dashboard" description="Overview">
        <p>Content</p>
      </AppShell>
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("My Dashboard");
  });

  it("renders eyebrow text", () => {
    render(
      <AppShell eyebrow="Leagues" title="Title" description="Desc">
        <p>Body</p>
      </AppShell>
    );
    expect(screen.getByText("Leagues")).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(
      <AppShell eyebrow="E" title="T" description="Detailed description">
        <p>Body</p>
      </AppShell>
    );
    expect(screen.getByText("Detailed description")).toBeInTheDocument();
  });

  it("renders children in main content area", () => {
    render(
      <AppShell eyebrow="E" title="T" description="D">
        <p>Main content here</p>
      </AppShell>
    );
    expect(screen.getByText("Main content here")).toBeInTheDocument();
  });

  it("renders as main element", () => {
    render(
      <AppShell eyebrow="E" title="T" description="D">
        <p>Body</p>
      </AppShell>
    );
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(
      <AppShell eyebrow="E" title="T" description="D" actions={<button>Go</button>}>
        <p>Body</p>
      </AppShell>
    );
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});
