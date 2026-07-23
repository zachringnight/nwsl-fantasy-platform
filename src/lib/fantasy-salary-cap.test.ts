import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSalaryCapAutofillSelections,
  buildSalaryCapEntrySummary,
  isPlayerEligibleForSalaryCapSlot,
  isSalaryCapEntryLocked,
  type FantasySalaryCapSelection,
} from "./fantasy-salary-cap";
import type { FantasyPoolPlayer } from "@/types/fantasy";

function player(
  id: string,
  position: FantasyPoolPlayer["position"],
  availability: FantasyPoolPlayer["availability"] = "available"
): FantasyPoolPlayer {
  return {
    id,
    display_name: id,
    club_name: "Club",
    position,
    average_points: 10,
    salary_cost: 10,
    availability,
    rank: 1,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("salary-cap rules", () => {
  it("hard-blocks out players but allows questionable players", () => {
    expect(isPlayerEligibleForSalaryCapSlot(player("out", "FWD", "out"), "FWD_1")).toBe(false);
    expect(
      isPlayerEligibleForSalaryCapSlot(
        player("questionable", "FWD", "questionable"),
        "FWD_1"
      )
    ).toBe(true);
  });

  it("treats exactly-at-lock as locked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T20:00:00Z"));
    expect(
      isSalaryCapEntryLocked({
        key: "slate",
        label: "Slate",
        cadence: "daily",
        starts_at: "2026-07-22T20:00:00Z",
        lock_at: "2026-07-22T20:00:00Z",
        ends_at: "2026-07-23T00:00:00Z",
        match_count: 1,
        slate_keys: ["slate"],
      })
    ).toBe(true);
  });

  it("builds a legal complete lineup exactly at the cap", () => {
    const pool = [
      player("gk", "GK"),
      player("d1", "DEF"),
      player("d2", "DEF"),
      player("d3", "DEF"),
      player("m1", "MID"),
      player("m2", "MID"),
      player("m3", "MID"),
      player("f1", "FWD"),
      player("f2", "FWD"),
    ];
    const selections = buildSalaryCapAutofillSelections(pool, 90);
    const summary = buildSalaryCapEntrySummary(
      selections as FantasySalaryCapSelection[],
      90
    );

    expect(summary).toMatchObject({
      selectedCount: 9,
      salarySpent: 90,
      remainingBudget: 0,
      isComplete: true,
      isOverCap: false,
    });
    expect(new Set(selections.map((selection) => selection.player?.id)).size).toBe(9);
  });
});
