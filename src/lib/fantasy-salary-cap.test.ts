import { describe, expect, it } from "vitest";
import {
  isPlayerEligibleForSalaryCapSlot,
  buildSalaryCapEntrySummary,
  isSalaryCapEntryLocked,
  buildSalaryCapEntryWindowState,
  getRecommendedSalaryCapSlot,
  buildSalaryCapAutofillSelections,
  buildSalaryCapActionLabel,
  salaryCapLineupSlots,
  type FantasySalaryCapSelection,
  type FantasySalaryCapEntrySummary,
} from "./fantasy-salary-cap";
import type {
  FantasyLeagueRecord,
  FantasyPoolPlayer,
  FantasySalaryCapEntryRecord,
  FantasySlateWindow,
} from "@/types/fantasy";

// ── Helpers ──────────────────────────────────────────────────

function makePoolPlayer(
  overrides: Partial<FantasyPoolPlayer> = {}
): FantasyPoolPlayer {
  return {
    id: overrides.id ?? `player-${Math.random().toString(36).slice(2, 8)}`,
    display_name: overrides.display_name ?? "Player",
    club_name: overrides.club_name ?? "Portland Thorns",
    position: overrides.position ?? "MID",
    average_points: overrides.average_points ?? 8.0,
    salary_cost: overrides.salary_cost ?? 10,
    availability: overrides.availability ?? "available",
    rank: overrides.rank ?? 1,
  };
}

function makeEmptySelections(): FantasySalaryCapSelection[] {
  return salaryCapLineupSlots.map((slot) => ({ lineup_slot: slot, player: null }));
}

function makeLeague(
  overrides: Partial<FantasyLeagueRecord> = {}
): FantasyLeagueRecord {
  return {
    id: "league-1",
    name: "Test League",
    code: "ABC123",
    privacy: "private",
    status: "live",
    game_variant: overrides.game_variant ?? "salary_cap_daily",
    roster_build_mode: "salary_cap",
    player_ownership_mode: "shared",
    contest_horizon: overrides.contest_horizon ?? "daily",
    salary_cap_amount: overrides.salary_cap_amount ?? 100,
    manager_count_target: 8,
    draft_at: "2026-03-01T00:00:00.000Z",
    commissioner_user_id: "user-1",
    ...overrides,
  };
}

function makeEntry(
  overrides: Partial<FantasySalaryCapEntryRecord> = {}
): FantasySalaryCapEntryRecord {
  return {
    id: "entry-1",
    league_id: "league-1",
    user_id: "user-1",
    slate_key: "2026-03-14",
    entry_name: "My Entry",
    status: overrides.status ?? "draft",
    salary_spent: 0,
    submitted_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSlate(overrides: Partial<FantasySlateWindow> = {}): FantasySlateWindow {
  return {
    key: "2026-03-14",
    label: "Saturday, Mar 14",
    cadence: "daily",
    starts_at: "2026-03-14T13:30:00.000Z",
    lock_at: overrides.lock_at ?? "2026-03-14T13:30:00.000Z",
    ends_at: "2026-03-15T01:45:00.000Z",
    match_count: 5,
    slate_keys: ["2026-03-14"],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("isPlayerEligibleForSalaryCapSlot", () => {
  it("allows a GK for the GK slot", () => {
    const player = makePoolPlayer({ position: "GK" });
    expect(isPlayerEligibleForSalaryCapSlot(player, "GK")).toBe(true);
  });

  it("rejects a GK for the FLEX slot", () => {
    const player = makePoolPlayer({ position: "GK" });
    expect(isPlayerEligibleForSalaryCapSlot(player, "FLEX")).toBe(false);
  });

  it("allows a MID for MID_1, MID_2, MID_3, and FLEX", () => {
    const player = makePoolPlayer({ position: "MID" });
    expect(isPlayerEligibleForSalaryCapSlot(player, "MID_1")).toBe(true);
    expect(isPlayerEligibleForSalaryCapSlot(player, "MID_2")).toBe(true);
    expect(isPlayerEligibleForSalaryCapSlot(player, "MID_3")).toBe(true);
    expect(isPlayerEligibleForSalaryCapSlot(player, "FLEX")).toBe(true);
  });

  it("rejects a DEF for FWD_1", () => {
    const player = makePoolPlayer({ position: "DEF" });
    expect(isPlayerEligibleForSalaryCapSlot(player, "FWD_1")).toBe(false);
  });
});

describe("buildSalaryCapEntrySummary", () => {
  it("computes zeroed summary for empty selections", () => {
    const selections = makeEmptySelections();
    const summary = buildSalaryCapEntrySummary(selections, 100);

    expect(summary.salarySpent).toBe(0);
    expect(summary.remainingBudget).toBe(100);
    expect(summary.projectedPoints).toBe(0);
    expect(summary.selectedCount).toBe(0);
    expect(summary.isComplete).toBe(false);
    expect(summary.isOverCap).toBe(false);
  });

  it("sums salary and projected points for filled selections", () => {
    const selections: FantasySalaryCapSelection[] = [
      { lineup_slot: "GK", player: makePoolPlayer({ salary_cost: 12, average_points: 5.5 }) },
      { lineup_slot: "DEF_1", player: makePoolPlayer({ salary_cost: 10, average_points: 7.0 }) },
      ...salaryCapLineupSlots.slice(2).map((slot) => ({
        lineup_slot: slot,
        player: null,
      })),
    ];
    const summary = buildSalaryCapEntrySummary(selections, 100);

    expect(summary.salarySpent).toBe(22);
    expect(summary.remainingBudget).toBe(78);
    expect(summary.projectedPoints).toBe(12.5);
    expect(summary.selectedCount).toBe(2);
    expect(summary.isComplete).toBe(false);
  });

  it("marks isComplete when all 9 starter slots are filled", () => {
    const selections = salaryCapLineupSlots.map((slot) => ({
      lineup_slot: slot,
      player: makePoolPlayer({ salary_cost: 10, average_points: 6 }),
    }));
    const summary = buildSalaryCapEntrySummary(selections, 100);

    expect(summary.isComplete).toBe(true);
    expect(summary.selectedCount).toBe(9);
  });

  it("marks isOverCap when salary exceeds the cap", () => {
    const selections = salaryCapLineupSlots.map((slot) => ({
      lineup_slot: slot,
      player: makePoolPlayer({ salary_cost: 20, average_points: 6 }),
    }));
    const summary = buildSalaryCapEntrySummary(selections, 100);

    expect(summary.isOverCap).toBe(true);
    expect(summary.remainingBudget).toBeLessThan(0);
  });
});

describe("isSalaryCapEntryLocked", () => {
  it("returns true when current time is past lock_at", () => {
    const slate = makeSlate({ lock_at: "2020-01-01T00:00:00.000Z" });
    expect(isSalaryCapEntryLocked(slate)).toBe(true);
  });

  it("returns false when current time is before lock_at", () => {
    const slate = makeSlate({ lock_at: "2099-12-31T23:59:59.000Z" });
    expect(isSalaryCapEntryLocked(slate)).toBe(false);
  });
});

describe("buildSalaryCapEntryWindowState", () => {
  it("returns 'locked' status when locked and submitted", () => {
    const league = makeLeague();
    const entry = makeEntry({ status: "submitted" });
    const summary: FantasySalaryCapEntrySummary = {
      salarySpent: 90,
      remainingBudget: 10,
      projectedPoints: 60,
      selectedCount: 9,
      isComplete: true,
      isOverCap: false,
    };
    const slate = makeSlate({ lock_at: "2020-01-01T00:00:00.000Z" });

    const state = buildSalaryCapEntryWindowState(league, entry, summary, slate);
    expect(state.status).toBe("locked");
    expect(state.tone).toBe("success");
    expect(state.is_locked).toBe(true);
    expect(state.requires_submission).toBe(false);
  });

  it("returns 'missed' status when locked but not submitted", () => {
    const league = makeLeague();
    const entry = makeEntry({ status: "draft" });
    const summary: FantasySalaryCapEntrySummary = {
      salarySpent: 0,
      remainingBudget: 100,
      projectedPoints: 0,
      selectedCount: 0,
      isComplete: false,
      isOverCap: false,
    };
    const slate = makeSlate({ lock_at: "2020-01-01T00:00:00.000Z" });

    const state = buildSalaryCapEntryWindowState(league, entry, summary, slate);
    expect(state.status).toBe("missed");
    expect(state.tone).toBe("warning");
    expect(state.is_locked).toBe(true);
    expect(state.requires_submission).toBe(true);
  });

  it("returns 'submitted' status when not locked and submitted", () => {
    const league = makeLeague();
    const entry = makeEntry({ status: "submitted" });
    const summary: FantasySalaryCapEntrySummary = {
      salarySpent: 90,
      remainingBudget: 10,
      projectedPoints: 60,
      selectedCount: 9,
      isComplete: true,
      isOverCap: false,
    };
    const slate = makeSlate({ lock_at: "2099-12-31T23:59:59.000Z" });

    const state = buildSalaryCapEntryWindowState(league, entry, summary, slate);
    expect(state.status).toBe("submitted");
    expect(state.tone).toBe("success");
    expect(state.is_locked).toBe(false);
    expect(state.requires_submission).toBe(false);
  });

  it("returns 'open' with warning when complete, under cap, and not submitted", () => {
    const league = makeLeague();
    const entry = makeEntry({ status: "draft" });
    const summary: FantasySalaryCapEntrySummary = {
      salarySpent: 90,
      remainingBudget: 10,
      projectedPoints: 60,
      selectedCount: 9,
      isComplete: true,
      isOverCap: false,
    };
    const slate = makeSlate({ lock_at: "2099-12-31T23:59:59.000Z" });

    const state = buildSalaryCapEntryWindowState(league, entry, summary, slate);
    expect(state.status).toBe("open");
    expect(state.tone).toBe("warning");
    expect(state.requires_submission).toBe(true);
  });

  it("returns 'open' with info when incomplete and not submitted", () => {
    const league = makeLeague();
    const entry = makeEntry({ status: "draft" });
    const summary: FantasySalaryCapEntrySummary = {
      salarySpent: 20,
      remainingBudget: 80,
      projectedPoints: 12,
      selectedCount: 2,
      isComplete: false,
      isOverCap: false,
    };
    const slate = makeSlate({ lock_at: "2099-12-31T23:59:59.000Z" });

    const state = buildSalaryCapEntryWindowState(league, entry, summary, slate);
    expect(state.status).toBe("open");
    expect(state.tone).toBe("info");
    expect(state.title).toBe("Build before lock");
  });
});

describe("getRecommendedSalaryCapSlot", () => {
  it("returns the first open eligible slot", () => {
    const player = makePoolPlayer({ position: "MID" });
    const selections = makeEmptySelections();
    const slot = getRecommendedSalaryCapSlot(player, selections);

    expect(slot).toBe("MID_1");
  });

  it("returns the second slot when the first is occupied", () => {
    const player = makePoolPlayer({ position: "MID" });
    const selections = makeEmptySelections();
    selections[3] = { lineup_slot: "MID_1", player: makePoolPlayer({ position: "MID" }) };

    const slot = getRecommendedSalaryCapSlot(player, selections);
    expect(slot).toBe("MID_2");
  });

  it("falls back to displacing the weakest current player when all slots are full", () => {
    const player = makePoolPlayer({ position: "MID", average_points: 15 });
    const selections: FantasySalaryCapSelection[] = salaryCapLineupSlots.map((slot) => ({
      lineup_slot: slot,
      player: makePoolPlayer({
        position: slot.startsWith("MID") ? "MID" : slot.startsWith("DEF") ? "DEF" : slot.startsWith("FWD") ? "FWD" : slot === "GK" ? "GK" : "MID",
        average_points: slot === "MID_1" ? 3 : 10,
      }),
    }));

    const slot = getRecommendedSalaryCapSlot(player, selections);
    // Should recommend the slot with the weakest eligible player
    expect(slot).toBe("MID_1");
  });
});

describe("buildSalaryCapActionLabel", () => {
  it("returns label with specific slot when a recommendation exists", () => {
    const player = makePoolPlayer({ position: "FWD" });
    const selections = makeEmptySelections();
    const label = buildSalaryCapActionLabel(player, selections);

    expect(label).toBe("Add to FWD 1");
  });
});

describe("buildSalaryCapAutofillSelections", () => {
  it("returns a complete lineup of 9 selections", () => {
    const pool = [
      ...Array.from({ length: 3 }, (_, i) =>
        makePoolPlayer({ id: `gk-${i}`, position: "GK", salary_cost: 8, average_points: 5 + i })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makePoolPlayer({ id: `def-${i}`, position: "DEF", salary_cost: 9, average_points: 6 + i })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makePoolPlayer({ id: `mid-${i}`, position: "MID", salary_cost: 10, average_points: 7 + i })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makePoolPlayer({ id: `fwd-${i}`, position: "FWD", salary_cost: 11, average_points: 8 + i })
      ),
    ];

    const selections = buildSalaryCapAutofillSelections(pool, 200);
    expect(selections).toHaveLength(salaryCapLineupSlots.length);
    expect(selections.every((s) => s.player != null)).toBe(true);
  });

  it("stays within the salary cap", () => {
    const pool = [
      ...Array.from({ length: 3 }, (_, i) =>
        makePoolPlayer({ id: `gk-${i}`, position: "GK", salary_cost: 8, average_points: 5 + i })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makePoolPlayer({ id: `def-${i}`, position: "DEF", salary_cost: 9, average_points: 6 + i })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makePoolPlayer({ id: `mid-${i}`, position: "MID", salary_cost: 10, average_points: 7 + i })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makePoolPlayer({ id: `fwd-${i}`, position: "FWD", salary_cost: 11, average_points: 8 + i })
      ),
    ];
    const cap = 200;
    const selections = buildSalaryCapAutofillSelections(pool, cap);
    const totalSalary = selections.reduce((sum, s) => sum + (s.player?.salary_cost ?? 0), 0);

    expect(totalSalary).toBeLessThanOrEqual(cap);
  });

  it("throws when no legal lineup can be built", () => {
    const pool = [
      makePoolPlayer({ id: "gk", position: "GK", salary_cost: 100, average_points: 5 }),
      makePoolPlayer({ id: "def", position: "DEF", salary_cost: 100, average_points: 5 }),
    ];

    expect(() => buildSalaryCapAutofillSelections(pool, 50)).toThrow(
      "Unable to build a legal salary-cap lineup"
    );
  });

  it("assigns correct positions to lineup slots", () => {
    const pool = [
      ...Array.from({ length: 3 }, (_, i) =>
        makePoolPlayer({ id: `gk-${i}`, position: "GK", salary_cost: 5, average_points: 5 + i })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makePoolPlayer({ id: `def-${i}`, position: "DEF", salary_cost: 5, average_points: 6 + i })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makePoolPlayer({ id: `mid-${i}`, position: "MID", salary_cost: 5, average_points: 7 + i })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makePoolPlayer({ id: `fwd-${i}`, position: "FWD", salary_cost: 5, average_points: 8 + i })
      ),
    ];

    const selections = buildSalaryCapAutofillSelections(pool, 200);
    const gkSlot = selections.find((s) => s.lineup_slot === "GK");
    expect(gkSlot?.player?.position).toBe("GK");

    const def1 = selections.find((s) => s.lineup_slot === "DEF_1");
    expect(def1?.player?.position).toBe("DEF");

    const mid1 = selections.find((s) => s.lineup_slot === "MID_1");
    expect(mid1?.player?.position).toBe("MID");

    const fwd1 = selections.find((s) => s.lineup_slot === "FWD_1");
    expect(fwd1?.player?.position).toBe("FWD");

    const flex = selections.find((s) => s.lineup_slot === "FLEX");
    expect(["DEF", "MID", "FWD"]).toContain(flex?.player?.position);
  });
});
