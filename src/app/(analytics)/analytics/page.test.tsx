import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchResult, TeamStanding } from "@/types/analytics";

const mocks = vi.hoisted(() => ({
  getLeagueTable: vi.fn(),
  getLeagueTableBySeason: vi.fn(),
  getPlayerRankings: vi.fn(),
  getMatchPredictions: vi.fn(),
  getMatchResultsBySeason: vi.fn(),
  getLiveNwslPublicData: vi.fn(),
}));

vi.mock("@/components/common/app-shell", () => ({
  AppShell: ({
    description,
    children,
  }: {
    description: string;
    children: React.ReactNode;
  }) => (
    <main>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock("@/components/ui/metric-tile", () => ({
  MetricTile: ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

vi.mock("@/components/ui/pill", () => ({
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/analytics/scoring-trends", () => ({
  ScoringTrends: () => <div>Scoring trends</div>,
}));

vi.mock("@/lib/analytics/analytics-data", () => ({
  getLeagueTable: mocks.getLeagueTable,
  getLeagueTableBySeason: mocks.getLeagueTableBySeason,
  getPlayerRankings: mocks.getPlayerRankings,
}));

vi.mock("@/lib/analytics/general-predictions-data", () => ({
  getMatchPredictions: mocks.getMatchPredictions,
}));

vi.mock("@/lib/analytics/analytics-real-data", () => ({
  getMatchResultsBySeason: mocks.getMatchResultsBySeason,
}));

vi.mock("@/lib/analytics/live-nwsl-public-data", () => ({
  getLiveNwslPublicData: mocks.getLiveNwslPublicData,
}));

import AnalyticsPage from "./page";

const standing: TeamStanding = {
  teamId: "archive-team",
  team: "Archive Team",
  played: 26,
  won: 13,
  drawn: 7,
  lost: 6,
  goalsFor: 40,
  goalsAgainst: 25,
  goalDifference: 15,
  points: 46,
  form: ["W"],
  xg: 0,
  xga: 0,
};

const match: MatchResult = {
  matchId: "archive-match",
  date: "2025-10-01",
  matchday: 24,
  homeTeam: "Archive Team",
  homeTeamId: "archive-team",
  awayTeam: "Other Team",
  awayTeamId: "other-team",
  homeGoals: 2,
  awayGoals: 1,
  homeXg: 0,
  awayXg: 0,
  venue: "Archive Ground",
  status: "completed",
};

describe("AnalyticsPage season routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLeagueTableBySeason.mockReturnValue([standing]);
    mocks.getMatchResultsBySeason.mockReturnValue([match]);
    mocks.getMatchPredictions.mockReturnValue([]);
  });

  it("uses archived standings and matches for the 2025 overview", async () => {
    render(
      await AnalyticsPage({
        searchParams: Promise.resolve({ season: "2025" }),
      })
    );

    expect(
      screen.getByText(
        "2025 stats from 1 team and 1 match. Powered by the ESPN archive."
      )
    ).toBeInTheDocument();
    expect(mocks.getLeagueTableBySeason).toHaveBeenCalledWith("2025");
    expect(mocks.getMatchResultsBySeason).toHaveBeenCalledWith("2025");
    expect(mocks.getLiveNwslPublicData).not.toHaveBeenCalled();
    expect(mocks.getPlayerRankings).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "League Table" })).toHaveAttribute(
      "href",
      "/analytics/teams?season=2025"
    );
    expect(screen.getByRole("link", { name: "Top Players" })).toHaveAttribute(
      "href",
      "/analytics/players?season=2025"
    );
  });
});
