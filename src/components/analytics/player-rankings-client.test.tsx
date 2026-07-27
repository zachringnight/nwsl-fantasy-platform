import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AnalyticsProvenance,
  PlayerSeasonStats,
} from "@/types/analytics";
import { PlayerRankingsClient } from "./player-rankings-client";

vi.mock("@/components/common/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const provenance: AnalyticsProvenance = {
  season: "2026",
  source: "Official NWSL / Opta",
  generatedAt: "2026-07-26T20:00:00Z",
  isLive: true,
  isStale: false,
};

function player(
  playerId: string,
  coverage: Pick<
    PlayerSeasonStats,
    "matchStatsAppearances" | "matchStatsComplete"
  >
): PlayerSeasonStats {
  return {
    playerId,
    name: `Player ${playerId}`,
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
    fantasyPoints: 42,
    pointsPer90: 6.3,
    ...coverage,
  };
}

describe("PlayerRankingsClient match-log coverage", () => {
  it("marks only incomplete tracked fantasy totals with accessible coverage detail", () => {
    const coverageLabel =
      "Partial tracked fantasy total: match-by-match detail is available for 3 of 8 appearances; official season totals remain available.";

    render(
      <PlayerRankingsClient
        players={[
          player("partial", {
            matchStatsAppearances: 3,
            matchStatsComplete: false,
          }),
          player("complete", {
            matchStatsAppearances: 8,
            matchStatsComplete: true,
          }),
        ]}
        provenance={provenance}
        season="2026"
      />
    );

    const marker = screen.getByLabelText(coverageLabel);
    expect(marker).toHaveTextContent("Partial");
    expect(marker).toHaveAttribute("title", coverageLabel);
    expect(screen.getAllByText("Partial")).toHaveLength(1);
  });
});
