import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SiteFooter } from "./site-footer";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("SiteFooter", () => {
  it("renders the site name", () => {
    render(<SiteFooter />);
    expect(screen.getByText("NWSL Fantasy")).toBeInTheDocument();
  });

  it("renders footer navigation links", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/rules");
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute("href", "/players");
    expect(screen.getByRole("link", { name: "Leagues" })).toHaveAttribute("href", "/leagues");
  });

  it("renders legal links", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
  });

  it("renders copyright notice", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/2026 NWSL Fantasy/)).toBeInTheDocument();
  });

  it("has a footer navigation with aria-label", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("navigation", { name: "Footer" })).toBeInTheDocument();
  });
});
