import { describe, expect, it } from "vitest";
import {
  buildSalaryCapAutofillSelections,
  buildSalaryCapEntrySummary,
} from "@/lib/fantasy-salary-cap";
import type { FantasyPoolPlayer } from "@/types/fantasy";

function buildPlayer(
  id: string,
  position: FantasyPoolPlayer["position"],
  salary: number,
  average: number,
  projected: number
): FantasyPoolPlayer {
  return {
    id,
    display_name: id,
    club_name: "Test FC",
    position,
    average_points: average,
    projected_points: projected,
    salary_cost: salary,
    availability: "available",
    rank: 1,
  };
}

describe("fantasy salary-cap projections", () => {
  it("uses materialized projected points in lineup summaries", () => {
    const summary = buildSalaryCapEntrySummary(
      [
        {
          lineup_slot: "GK",
          player: buildPlayer("gk-1", "GK", 8, 7, 11.5),
        },
      ],
      100
    );

    expect(summary.projectedPoints).toBe(11.5);
  });

  it("autofill favors projected points over stale averages", () => {
    const playerPool: FantasyPoolPlayer[] = [
      buildPlayer("gk-a", "GK", 8, 12, 7),
      buildPlayer("gk-b", "GK", 8, 6, 11),
      buildPlayer("def-a", "DEF", 8, 12, 7),
      buildPlayer("def-b", "DEF", 8, 11, 10),
      buildPlayer("def-c", "DEF", 8, 5, 12),
      buildPlayer("mid-a", "MID", 9, 14, 8),
      buildPlayer("mid-b", "MID", 9, 13, 10),
      buildPlayer("mid-c", "MID", 9, 12, 11),
      buildPlayer("mid-d", "MID", 9, 4, 12),
      buildPlayer("fwd-a", "FWD", 10, 15, 8),
      buildPlayer("fwd-b", "FWD", 10, 14, 11),
      buildPlayer("fwd-c", "FWD", 10, 6, 12),
    ];

    const selections = buildSalaryCapAutofillSelections(playerPool, 120);
    const selectedIds = new Set(
      selections
        .map((selection) => selection.player?.id ?? null)
        .filter((playerId): playerId is string => playerId != null)
    );

    expect(selectedIds.has("gk-b")).toBe(true);
    expect(selectedIds.has("def-c")).toBe(true);
    expect(selectedIds.has("mid-d")).toBe(true);
    expect(selectedIds.has("fwd-c")).toBe(true);
    expect(selectedIds.has("gk-a")).toBe(false);
  });
});
