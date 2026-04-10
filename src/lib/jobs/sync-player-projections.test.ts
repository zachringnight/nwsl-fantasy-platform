import { beforeEach, describe, expect, it, vi } from "vitest";

const getMaterializedFantasyProjectionSlate = vi.fn();
const providerFindUnique = vi.fn();
const providerFixtureMapFindMany = vi.fn();
const providerPlayerMapFindMany = vi.fn();
const playerProjectionUpsert = vi.fn();

vi.mock("@/lib/projections/materialize", () => ({
  getMaterializedFantasyProjectionSlate,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: {
      findUnique: providerFindUnique,
    },
    providerFixtureMap: {
      findMany: providerFixtureMapFindMany,
    },
    providerPlayerMap: {
      findMany: providerPlayerMapFindMany,
    },
    playerProjection: {
      upsert: playerProjectionUpsert,
    },
  },
}));

describe("syncPlayerProjectionsJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("persists canonical projections through provider ids instead of team and player names", async () => {
    getMaterializedFantasyProjectionSlate.mockResolvedValue({
      matches: [
        {
          matchKey: "nwsl::Football_Match::fixture_1",
        },
      ],
      players: [
        {
          official_player_id: "nwsl::Football_Player::player_1",
          match_key: "nwsl::Football_Match::fixture_1",
          display_name: "Temwa Chawinga",
          club_name: "Current",
          projected_points: 12.4,
          average_points: 12.4,
          floor_points: 8.1,
          ceiling_points: 16.7,
          projection_confidence: 0.81,
          salary_cost: 10,
        },
      ],
    });
    providerFindUnique.mockResolvedValue({ id: "provider_1" });
    providerFixtureMapFindMany.mockResolvedValue([
      {
        providerFixtureId: "nwsl::Football_Match::fixture_1",
        fixtureId: "fixture_db_1",
      },
    ]);
    providerPlayerMapFindMany.mockResolvedValue([
      {
        providerPlayerId: "nwsl::Football_Player::player_1",
        playerId: "player_db_1",
      },
    ]);
    playerProjectionUpsert.mockResolvedValue({});

    const { syncPlayerProjectionsJob } = await import("./sync-player-projections");
    const result = await syncPlayerProjectionsJob.run({
      startedAt: "2026-04-07T19:00:00.000Z",
    });

    expect(getMaterializedFantasyProjectionSlate).toHaveBeenCalledWith(
      "site_launch_v1",
      "salary_cap_season_long"
    );
    expect(playerProjectionUpsert).toHaveBeenCalledWith({
      where: {
        playerId_fixtureId: {
          playerId: "player_db_1",
          fixtureId: "fixture_db_1",
        },
      },
      create: {
        playerId: "player_db_1",
        fixtureId: "fixture_db_1",
        projectedPoints: 12.4,
        confidence: 0.81,
        floorPoints: 8.1,
        ceilingPoints: 16.7,
        valueRating: "elite_value",
      },
      update: {
        projectedPoints: 12.4,
        confidence: 0.81,
        floorPoints: 8.1,
        ceilingPoints: 16.7,
        valueRating: "elite_value",
        generatedAt: expect.any(Date),
      },
    });
    expect(result.status).toBe("success");
    expect(result.summary).toContain("Upserted 1 player projections");
    expect(result.summary).toContain("Skipped 0 rows");
  });

  it("skips the job when the official provider is missing", async () => {
    getMaterializedFantasyProjectionSlate.mockResolvedValue({
      matches: [{ matchKey: "nwsl::Football_Match::fixture_1" }],
      players: [
        {
          official_player_id: "nwsl::Football_Player::player_1",
          match_key: "nwsl::Football_Match::fixture_1",
          projected_points: 12.4,
          average_points: 12.4,
          salary_cost: 22,
        },
      ],
    });
    providerFindUnique.mockResolvedValue(null);

    const { syncPlayerProjectionsJob } = await import("./sync-player-projections");
    const result = await syncPlayerProjectionsJob.run({
      startedAt: "2026-04-07T19:00:00.000Z",
    });

    expect(result.status).toBe("skipped");
    expect(result.summary).toContain("official NWSL provider is not configured");
    expect(playerProjectionUpsert).not.toHaveBeenCalled();
  });
});
