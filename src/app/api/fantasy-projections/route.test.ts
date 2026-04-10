import { beforeEach, describe, expect, it, vi } from "vitest";

const getMaterializedFantasyProjectionSlate = vi.fn();

vi.mock("@/lib/projections/materialize", () => ({
  getMaterializedFantasyProjectionSlate,
}));

const materializedSlate = {
  generatedAt: "2026-04-07T19:00:00.000Z",
  schemaKey: "site_launch_v1" as const,
  schemaLabel: "Site Launch v1",
  slate: {
    key: "2026-04-25",
    label: "Saturday, Apr 25",
  },
  model: {
    requestedModel: "champion_pure",
    resolvedMode: "baseline_fallback" as const,
    modelVersion: "pure-projection-2025plus-v3",
    modelFamily: "home_field_baseline",
    gatingStatus: "baseline_fallback",
    calibrationApplied: false,
    notes: ["Using the approved non-market fallback."],
  },
  matches: [],
  players: [
    {
      id: "player_1",
      official_player_id: "nwsl::Football_Player::player_1",
      display_name: "Temwa Chawinga",
      club_name: "Kansas City Current",
      position: "FWD",
      average_points: 12.4,
      projected_points: 12.4,
      baseline_points: 10.8,
      floor_points: 8.1,
      ceiling_points: 16.7,
      salary_cost: 22,
      availability: "available",
      rank: 1,
      projection_confidence: 0.81,
      projection_quality: "high",
      projection_schema: "site_launch_v1",
      projection_schema_label: "Site Launch v1",
      model_version: "pure-projection-2025plus-v3",
      model_family: "home_field_baseline",
      gating_status: "baseline_fallback",
      calibration_applied: false,
      fixture_id: "nwsl::Football_Match::fixture_1",
      slate_key: "2026-04-25",
      opponent: "Washington Spirit",
      venue: "Home",
      expected_minutes: 83,
      starter_probability: 0.91,
      lineup_status: "Projected starter",
      lineup_note: "Started four of the last five.",
      stat_projection: {
        goals: 0.7,
        assists: 0.2,
        shots: 3.8,
        shotsOnTarget: 1.6,
        chancesCreated: 1.1,
        successfulPasses: 19.4,
        successfulCrosses: 0.4,
        tacklesWon: 0.7,
        interceptions: 0.3,
        blocks: 0.1,
        saves: 0,
        goalsConceded: 0,
        cleanSheetProbability: null,
        goalkeeperWinProbability: null,
        goalkeeperDrawProbability: null,
      },
      fantasy_breakdown: {
        total: 12.4,
      },
      schema_key: "site_launch_v1",
      schema_label: "Site Launch v1",
      match_key: "nwsl::Football_Match::fixture_1",
    },
    {
      id: "player_2",
      official_player_id: "nwsl::Football_Player::player_2",
      display_name: "Barbra Banda",
      club_name: "Orlando Pride",
      position: "FWD",
      average_points: 11.1,
      projected_points: 11.1,
      baseline_points: 9.8,
      floor_points: 7.2,
      ceiling_points: 15,
      salary_cost: 22,
      availability: "available",
      rank: 2,
      projection_confidence: 0.77,
      projection_quality: "high",
      projection_schema: "site_launch_v1",
      projection_schema_label: "Site Launch v1",
      model_version: "pure-projection-2025plus-v3",
      model_family: "home_field_baseline",
      gating_status: "baseline_fallback",
      calibration_applied: false,
      fixture_id: "nwsl::Football_Match::fixture_2",
      slate_key: "2026-04-25",
      opponent: "Racing Louisville",
      venue: "Away",
      expected_minutes: 80,
      starter_probability: 0.89,
      lineup_status: "Projected starter",
      lineup_note: "Locked into the front line.",
      stat_projection: {
        goals: 0.6,
        assists: 0.15,
        shots: 3.5,
        shotsOnTarget: 1.5,
        chancesCreated: 0.8,
        successfulPasses: 17.1,
        successfulCrosses: 0.3,
        tacklesWon: 0.5,
        interceptions: 0.2,
        blocks: 0.1,
        saves: 0,
        goalsConceded: 0,
        cleanSheetProbability: null,
        goalkeeperWinProbability: null,
        goalkeeperDrawProbability: null,
      },
      fantasy_breakdown: {
        total: 11.1,
      },
      schema_key: "site_launch_v1",
      schema_label: "Site Launch v1",
      match_key: "nwsl::Football_Match::fixture_2",
    },
  ],
};

describe("/api/fantasy-projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getMaterializedFantasyProjectionSlate.mockResolvedValue(materializedSlate);
  });

  it("returns the canonical materialized projection payload", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/fantasy-projections?playerId=player_1&fixtureId=nwsl::Football_Match::fixture_1"
      )
    );

    expect(getMaterializedFantasyProjectionSlate).toHaveBeenCalledWith(
      "site_launch_v1",
      "salary_cap_daily",
      undefined
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaKey: "site_launch_v1",
      schemaLabel: "Site Launch v1",
      players: [materializedSlate.players[0]],
    });
  });

  it("can serialize the materialized slate as csv", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/fantasy-projections?format=csv")
    );

    expect(response.headers.get("Content-Type")).toContain("text/csv");
    await expect(response.text()).resolves.toContain(
      "player_id,player,club,position"
    );
  });
});
