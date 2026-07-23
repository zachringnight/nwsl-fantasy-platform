import { describe, expect, it } from "vitest";
import { applyScoringOverrides } from "./fantasy-scoring-overrides";

describe("scoring overrides", () => {
  it("uses the latest applied correction for the matching player and match", () => {
    const snapshots = [
      {
        player_id: "player",
        match_id: "match",
        match_date_utc: "2026-07-22T00:00:00Z",
        points: 8,
        breakdown: { goals: 8 },
        is_approximated: false,
      },
    ];
    const overrides = [
      {
        id: "override",
        player_id: "player",
        player_name: "Player",
        match_id: "match",
        original_points: 8,
        corrected_points: 13,
        reason: "Assist added",
        status: "applied" as const,
        created_by: "admin",
        created_at: "2026-07-22T01:00:00Z",
      },
    ];

    expect(applyScoringOverrides(snapshots, overrides)[0]).toMatchObject({
      points: 13,
      breakdown: { goals: 8, adminOverride: 5 },
    });
  });
});
