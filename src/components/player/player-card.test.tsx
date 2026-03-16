import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlayerCard } from "./player-card";
import type { FantasyPoolPlayer } from "@/types/fantasy";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock("@/config/nwsl-clubs", () => ({
  findClub: () => null,
}));

const mockPlayer: FantasyPoolPlayer = {
  id: "player-1",
  display_name: "Sophia Smith",
  position: "FWD",
  club_name: "Portland Thorns",
  rank: 1,
  average_points: 12.5,
  salary_cost: 9500,
  availability: "available",
  photo_url: null,
};

describe("PlayerCard", () => {
  it("renders player name as title", () => {
    render(<PlayerCard player={mockPlayer} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Sophia Smith");
  });

  it("renders player position and club", () => {
    render(<PlayerCard player={mockPlayer} />);
    const posTexts = screen.getAllByText(/FWD/);
    expect(posTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders average points", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("12.5")).toBeInTheDocument();
  });

  it("renders salary cost", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("$9500")).toBeInTheDocument();
  });

  it("renders player rank", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("renders availability pill", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("available")).toBeInTheDocument();
  });

  it("renders view details link", () => {
    render(<PlayerCard player={mockPlayer} />);
    const link = screen.getByRole("link", { name: /View details/ });
    expect(link).toHaveAttribute("href", "/players/player-1");
  });

  it("renders custom detailHref", () => {
    render(<PlayerCard player={mockPlayer} detailHref="/custom/path" />);
    const link = screen.getByRole("link", { name: /View details/ });
    expect(link).toHaveAttribute("href", "/custom/path");
  });

  it("renders action link when provided", () => {
    render(<PlayerCard player={mockPlayer} actionHref="/add" actionLabel="Add to team" />);
    expect(screen.getByRole("link", { name: "Add to team" })).toBeInTheDocument();
  });

  it("calls onToggleWatchlist when watchlist button clicked", () => {
    const handleToggle = vi.fn();
    render(<PlayerCard player={mockPlayer} onToggleWatchlist={handleToggle} />);
    fireEvent.click(screen.getByText("Watchlist"));
    expect(handleToggle).toHaveBeenCalledOnce();
  });

  it("shows Watching label when watchlisted", () => {
    render(<PlayerCard player={mockPlayer} onToggleWatchlist={vi.fn()} isWatchlisted />);
    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("calls onToggleCompare when compare button clicked", () => {
    const handleCompare = vi.fn();
    render(<PlayerCard player={mockPlayer} onToggleCompare={handleCompare} />);
    fireEvent.click(screen.getByText("Compare"));
    expect(handleCompare).toHaveBeenCalledOnce();
  });

  it("shows Selected label when compared", () => {
    render(<PlayerCard player={mockPlayer} onToggleCompare={vi.fn()} isCompared />);
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("disables compare button when compareDisabled", () => {
    render(<PlayerCard player={mockPlayer} onToggleCompare={vi.fn()} compareDisabled />);
    const btn = screen.getByText("Compare full").closest("button");
    expect(btn).toBeDisabled();
  });

  it("renders ownership label when provided", () => {
    render(<PlayerCard player={mockPlayer} ownershipLabel="Team Alpha" />);
    expect(screen.getByText("Team Alpha")).toBeInTheDocument();
  });
});
