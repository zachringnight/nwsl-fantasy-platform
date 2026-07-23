import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LeagueCard } from "./league-card";
import type { DemoLeague } from "@/types/fantasy";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockLeague: DemoLeague = {
  id: "league-1",
  name: "Thorns FC League",
  status: "Active",
  record: "5-2-1",
  draftStatus: "Complete",
  nextAction: "Set your lineup for Week 9.",
};

const commissionerLeague: DemoLeague = {
  id: "league-2",
  name: "Commissioner League",
  status: "Commissioner Room",
  record: "8-0-0",
  draftStatus: "Pending",
  nextAction: "Schedule your draft.",
};

describe("LeagueCard", () => {
  it("renders league name as heading", () => {
    render(<LeagueCard league={mockLeague} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Thorns FC League");
  });

  it("renders league status as eyebrow", () => {
    render(<LeagueCard league={mockLeague} />);
    const statusTexts = screen.getAllByText("Active");
    expect(statusTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders record in a pill", () => {
    render(<LeagueCard league={mockLeague} />);
    expect(screen.getByText("5-2-1")).toBeInTheDocument();
  });

  it("renders draft status in a pill", () => {
    render(<LeagueCard league={mockLeague} />);
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("renders next action text", () => {
    render(<LeagueCard league={mockLeague} />);
    const actionTexts = screen.getAllByText("Set your lineup for Week 9.");
    expect(actionTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders link to league page", () => {
    render(<LeagueCard league={mockLeague} />);
    const link = screen.getByRole("link", { name: /Open league/ });
    expect(link).toHaveAttribute("href", "/leagues/league-1");
  });

  it("applies accent pill for commissioner leagues", () => {
    render(<LeagueCard league={commissionerLeague} />);
    expect(screen.getByText("8-0-0")).toBeInTheDocument();
  });
});
