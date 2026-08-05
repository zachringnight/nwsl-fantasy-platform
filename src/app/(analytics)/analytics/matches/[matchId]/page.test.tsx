import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchResult } from "@/types/analytics";

const mocks = vi.hoisted(() => ({
  getLeagueTableBySeason: vi.fn(),
  getMatchDetail: vi.fn(),
  getMatchPrediction: vi.fn(),
  getTeamRatings: vi.fn(),
  getMatchResultsBySeason: vi.fn(),
  getEspnLiveMatch: vi.fn(),
  getLiveNwslPublicData: vi.fn(),
  getRecentTeamForm: vi.fn(),
  getHeadToHead: vi.fn(),
  buildPrematchNarrative: vi.fn(),
  buildMatchStateNarrative: vi.fn(),
}));

vi.mock("@/components/common/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/analytics/live-match-refresh", () => ({
  LiveMatchRefresh: () => null,
}));
vi.mock("@/components/analytics/local-kickoff-time", () => ({
  LocalKickoffTime: () => null,
}));
vi.mock("@/components/analytics/match-story", () => ({
  MatchStory: () => null,
}));
vi.mock("@/components/ui/pill", () => ({
  Pill: () => null,
}));

vi.mock("@/lib/analytics/analytics-data", () => ({
  getLeagueTableBySeason: mocks.getLeagueTableBySeason,
  getMatchDetail: mocks.getMatchDetail,
  getMatchPrediction: mocks.getMatchPrediction,
  getTeamRatings: mocks.getTeamRatings,
}));

vi.mock("@/lib/analytics/analytics-real-data", () => ({
  getMatchResultsBySeason: mocks.getMatchResultsBySeason,
}));

vi.mock("@/lib/analytics/espn-live-match", () => ({
  getEspnLiveMatch: mocks.getEspnLiveMatch,
}));

vi.mock("@/lib/analytics/live-nwsl-public-data", () => ({
  getLiveNwslPublicData: mocks.getLiveNwslPublicData,
}));

vi.mock("@/lib/analytics/match-context", () => ({
  getRecentTeamForm: mocks.getRecentTeamForm,
  getHeadToHead: mocks.getHeadToHead,
  buildPrematchNarrative: mocks.buildPrematchNarrative,
  buildMatchStateNarrative: mocks.buildMatchStateNarrative,
}));

import MatchDetailPage from "./page";

function result(matchId: string, date: string): MatchResult {
  return {
    matchId,
    date,
    matchday: 10,
    homeTeam: "Home",
    homeTeamId: "home",
    awayTeam: "Away",
    awayTeamId: "away",
    homeGoals: 1,
    awayGoals: 0,
    homeXg: 0,
    awayXg: 0,
    venue: "Ground",
    status: "completed",
  };
}

describe("MatchDetailPage archived context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEspnLiveMatch.mockResolvedValue(null);
    mocks.getLeagueTableBySeason.mockReturnValue([]);
    mocks.getTeamRatings.mockReturnValue([]);
    mocks.getMatchPrediction.mockReturnValue(undefined);
    mocks.getRecentTeamForm.mockReturnValue([]);
    mocks.getHeadToHead.mockReturnValue([]);
    mocks.buildMatchStateNarrative.mockReturnValue({
      title: "Final",
      lead: "Final",
      sections: [],
    });
  });

  it("uses 2025 matches for a 2025 match even when 2026 live data exists", async () => {
    const archivedMatch = result("archive-current", "2025-08-01");
    const archivedContext = [result("archive-previous", "2025-07-01")];
    const liveContext = [result("live-2026", "2026-07-01")];
    mocks.getMatchDetail.mockReturnValue({
      ...archivedMatch,
      homeShots: 0,
      awayShots: 0,
      homeShotsOnTarget: 0,
      awayShotsOnTarget: 0,
      homePossession: 0,
      awayPossession: 0,
      homeCorners: 0,
      awayCorners: 0,
      homeFouls: 0,
      awayFouls: 0,
      events: [],
    });
    mocks.getMatchResultsBySeason.mockReturnValue(archivedContext);
    mocks.getLiveNwslPublicData.mockResolvedValue({
      matches: liveContext,
      standings: [],
      teamRatings: [],
    });

    await MatchDetailPage({
      params: Promise.resolve({ matchId: archivedMatch.matchId }),
    });

    expect(mocks.getMatchResultsBySeason).toHaveBeenCalledWith("2025");
    expect(mocks.getRecentTeamForm).toHaveBeenNthCalledWith(
      1,
      archivedContext,
      "home",
      "2025-08-01",
      "archive-current"
    );
    expect(mocks.getRecentTeamForm).toHaveBeenNthCalledWith(
      2,
      archivedContext,
      "away",
      "2025-08-01",
      "archive-current"
    );
  });

  it("gives a live score one purposeful motion treatment and an accessible update", async () => {
    const liveMatch = {
      ...result("live-match", "2026-07-26"),
      status: "live" as const,
      homeGoals: 2,
      awayGoals: 2,
      homeShots: 0,
      awayShots: 0,
      homeShotsOnTarget: 0,
      awayShotsOnTarget: 0,
      homePossession: 0,
      awayPossession: 0,
      homeCorners: 0,
      awayCorners: 0,
      homeFouls: 0,
      awayFouls: 0,
      events: [],
    };
    mocks.getMatchDetail.mockReturnValue(liveMatch);
    mocks.getLiveNwslPublicData.mockResolvedValue({
      matches: [liveMatch],
      standings: [],
      teamRatings: [],
    });
    mocks.getEspnLiveMatch.mockResolvedValue({
      matchId: "live-match",
      phase: "live",
      statusLabel: "72'",
      kickoff: null,
      homeTeam: "Home",
      awayTeam: "Away",
      homeTeamEspnId: "home",
      awayTeamEspnId: "away",
      homeScore: 3,
      awayScore: 2,
      venue: "Ground",
      city: null,
      referee: null,
      broadcasts: [],
      stats: null,
      events: [],
      lineups: [],
    });

    const page = await MatchDetailPage({
      params: Promise.resolve({ matchId: liveMatch.matchId }),
    });
    const { container } = render(page);

    expect(
      container.querySelector(
        '.motion-reveal[data-motion-emphasis="live"][data-motion-variant="scale"]'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Score: Home 3, Away 2."
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

});
