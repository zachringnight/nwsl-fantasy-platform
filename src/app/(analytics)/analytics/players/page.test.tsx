import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalyticsProvenance,
  PlayerSeasonStats,
} from "@/types/analytics";

const mocks = vi.hoisted(() => ({
  getLiveNwslPublicData: vi.fn(),
  getPlayerRankings: vi.fn(),
}));

vi.mock("@/components/analytics/player-rankings-client", () => ({
  PlayerRankingsClient: () => null,
}));

vi.mock("@/lib/analytics/analytics-data", () => ({
  getPlayerRankings: mocks.getPlayerRankings,
}));

vi.mock("@/lib/analytics/live-nwsl-public-data", () => ({
  getLiveNwslPublicData: mocks.getLiveNwslPublicData,
}));

vi.mock("@/lib/generated/fantasy-player-pool.generated", () => ({
  officialFantasyPlayerPoolSource: {
    generatedAt: "2026-07-26T20:00:00Z",
  },
}));

import PlayerRankingsPage from "./page";

describe("PlayerRankingsPage season routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not substitute 2026 rankings into the 2025 archive", async () => {
    const element = (await PlayerRankingsPage({
      searchParams: Promise.resolve({ season: "2025" }),
    })) as ReactElement<{
      players: PlayerSeasonStats[];
      provenance: AnalyticsProvenance;
      season: "2025" | "2026";
    }>;

    expect(element.props.season).toBe("2025");
    expect(element.props.players).toEqual([]);
    expect(element.props.provenance.season).toBe("2025");
    expect(mocks.getLiveNwslPublicData).not.toHaveBeenCalled();
    expect(mocks.getPlayerRankings).not.toHaveBeenCalled();
  });
});
