import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MatchupScoreCard } from "./matchup-score-card";
import type { DemoMatchup } from "@/types/fantasy";

const mockDemoMatchup: DemoMatchup = {
  leagueName: "My League",
  homeTeam: "Portland Thorns",
  awayTeam: "Orlando Pride",
  homePoints: 85.5,
  awayPoints: 72.3,
  status: "Live",
};

describe("MatchupScoreCard", () => {
  it("renders matchup title with team names", () => {
    render(<MatchupScoreCard matchup={mockDemoMatchup} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Portland Thorns vs Orlando Pride");
  });

  it("renders league name as eyebrow", () => {
    render(<MatchupScoreCard matchup={mockDemoMatchup} />);
    expect(screen.getByText("My League")).toBeInTheDocument();
  });

  it("renders home team score", () => {
    render(<MatchupScoreCard matchup={mockDemoMatchup} />);
    expect(screen.getByText("85.5")).toBeInTheDocument();
  });

  it("renders away team score", () => {
    render(<MatchupScoreCard matchup={mockDemoMatchup} />);
    expect(screen.getByText("72.3")).toBeInTheDocument();
  });

  it("shows leading team name", () => {
    render(<MatchupScoreCard matchup={mockDemoMatchup} />);
    expect(screen.getByText("Portland Thorns leads")).toBeInTheDocument();
  });

  it("shows score delta", () => {
    render(<MatchupScoreCard matchup={mockDemoMatchup} />);
    // 85.5 - 72.3 = 13.2
    expect(screen.getByText("+13.2")).toBeInTheDocument();
  });

  it("renders status in pill", () => {
    render(<MatchupScoreCard matchup={mockDemoMatchup} />);
    const liveTexts = screen.getAllByText("Live");
    expect(liveTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows dead even when scores are equal", () => {
    const tiedMatchup: DemoMatchup = {
      ...mockDemoMatchup,
      homePoints: 50,
      awayPoints: 50,
    };
    render(<MatchupScoreCard matchup={tiedMatchup} />);
    expect(screen.getByText("Dead even")).toBeInTheDocument();
    expect(screen.getByText("Level")).toBeInTheDocument();
  });

  it("shows away team leads when away has more points", () => {
    const awayLeading: DemoMatchup = {
      ...mockDemoMatchup,
      homePoints: 40,
      awayPoints: 60,
    };
    render(<MatchupScoreCard matchup={awayLeading} />);
    expect(screen.getByText("Orlando Pride leads")).toBeInTheDocument();
  });
});
