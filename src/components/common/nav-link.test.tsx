import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NavLink } from "./nav-link";

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("NavLink", () => {
  it("renders the label text", () => {
    render(<NavLink href="/home" label="Home" isActive={false} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("links to the correct href", () => {
    render(<NavLink href="/dashboard" label="Dashboard" isActive={false} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("sets aria-current=page when active", () => {
    render(<NavLink href="/leagues" label="Leagues" isActive={true} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("does not set aria-current when inactive", () => {
    render(<NavLink href="/leagues" label="Leagues" isActive={false} />);
    const link = screen.getByRole("link");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("applies active styling when active", () => {
    render(<NavLink href="/home" label="Home" isActive={true} />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("border-brand");
    expect(link.className).toContain("bg-brand");
  });

  it("applies inactive styling when not active", () => {
    render(<NavLink href="/home" label="Home" isActive={false} />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("bg-white/6");
  });
});
