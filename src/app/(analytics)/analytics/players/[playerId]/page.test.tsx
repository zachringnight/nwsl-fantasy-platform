import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerSeasonStats } from "@/types/analytics";

const mocks = vi.hoisted(() => ({
  getLiveNwslPublicData: vi.fn(),
  getPlayerDetail: vi.fn(),
}));

vi.mock("@/components/common/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
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

vi.mock("@/components/analytics/charts/themed-line-chart", () => ({
  ThemedLineChart: () => <div>Line chart</div>,
}));

vi.mock("@/components/analytics/charts/themed-bar-chart", () => ({
  ThemedBarChart: () => <div>Bar chart</div>,
}));

vi.mock("@/components/analytics/charts/themed-radar-chart", () => ({
  ThemedRadarChart: () => <div>Radar chart</div>,
}));

vi.mock("@/lib/analytics/analytics-data", () => ({
  getPlayerDetail: mocks.getPlayerDetail,
}));

vi.mock("@/lib/analytics/live-nwsl-public-data", () => ({
  getLiveNwslPublicData: mocks.getLiveNwslPublicData,
}));

vi.mock("@/lib/scoring/scoring-engine", () => ({
  calculateAggregateFantasyScore: () => ({ breakdown: {} }),
}));

import PlayerDetailPage from "./page";

const partialPlayer: PlayerSeasonStats = {
  playerId: "partial-player",
  name: "Partial Player",
  team: "Test FC",
  teamId: "test-fc",
  position: "MID",
  appearances: 8,
  starts: 6,
  minutes: 600,
  goals: 2,
  assists: 3,
  xg: 1.5,
  xa: 2.1,
  shots: 12,
  shotsOnTarget: 6,
  passAccuracy: 82,
  tackles: 10,
  interceptions: 8,
  cleanSheets: 0,
  saves: 0,
  yellowCards: 1,
  redCards: 0,
  fantasyPoints: 18,
  pointsPer90: 2.7,
  matchStatsAppearances: 3,
  matchStatsComplete: false,
};

describe("PlayerDetailPage match-log coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLiveNwslPublicData.mockResolvedValue({
      provenance: {
        generatedAt: "2026-07-26T20:00:00Z",
      },
      players: [partialPlayer],
      playerForms: { [partialPlayer.playerId]: [] },
      playerMatchLogs: { [partialPlayer.playerId]: [] },
    });
  });

  it("distinguishes official season totals from partial match-by-match detail", async () => {
    render(
      await PlayerDetailPage({
        params: Promise.resolve({ playerId: partialPlayer.playerId }),
        searchParams: Promise.resolve({ season: "2026" }),
      })
    );

    expect(
      screen.getByRole("complementary", {
        name: "Match-by-match source coverage",
      })
    ).toHaveTextContent(
      "Official season totals remain available, but match-by-match detail is available for 3 of 8 appearances. Tracked fantasy totals reflect only those matches."
    );
  });
});
