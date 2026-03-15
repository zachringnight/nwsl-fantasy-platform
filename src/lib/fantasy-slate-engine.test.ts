import { describe, expect, it } from "vitest";
import {
  getFantasySlateWindows,
  getFantasyTargetSlate,
  getFantasyDefaultLockAt,
  getFantasySlateStatus,
  formatFantasySlateRange,
} from "./fantasy-slate-engine";
import type {
  FantasyLeagueRecord,
  FantasySlateWindow,
} from "@/types/fantasy";

// ── Helpers ──────────────────────────────────────────────────

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
    salary_cap_amount: 100,
    manager_count_target: 8,
    draft_at: "2026-03-01T00:00:00.000Z",
    commissioner_user_id: "user-1",
    ...overrides,
  };
}

function makeSlate(overrides: Partial<FantasySlateWindow> = {}): FantasySlateWindow {
  return {
    key: "2026-03-14",
    label: "Saturday, Mar 14",
    cadence: "daily",
    starts_at: "2026-03-14T13:30:00.000Z",
    lock_at: "2026-03-14T13:30:00.000Z",
    ends_at: "2026-03-15T01:45:00.000Z",
    match_count: 5,
    slate_keys: ["2026-03-14"],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("getFantasySlateWindows", () => {
  it("returns daily slate windows for salary_cap_daily variant", () => {
    const slates = getFantasySlateWindows("salary_cap_daily");
    expect(slates.length).toBeGreaterThan(0);
    expect(slates[0].cadence).toBe("daily");
  });

  it("returns weekly slate windows for salary_cap_weekly variant", () => {
    const slates = getFantasySlateWindows("salary_cap_weekly");
    expect(slates.length).toBeGreaterThan(0);
    expect(slates[0].cadence).toBe("weekly");
  });

  it("returns a single season window for classic_season_long variant", () => {
    const slates = getFantasySlateWindows("classic_season_long");
    expect(slates).toHaveLength(1);
    expect(slates[0].cadence).toBe("season");
    expect(slates[0].key).toBe("season-2026");
  });

  it("returns a single season window for salary_cap_season_long variant", () => {
    const slates = getFantasySlateWindows("salary_cap_season_long");
    expect(slates).toHaveLength(1);
    expect(slates[0].cadence).toBe("season");
  });

  it("accepts a league record instead of a variant string", () => {
    const league = makeLeague({ game_variant: "salary_cap_weekly", contest_horizon: "weekly" });
    const slates = getFantasySlateWindows(league);
    expect(slates.length).toBeGreaterThan(0);
    expect(slates[0].cadence).toBe("weekly");
  });

  it("daily slates have non-zero match counts", () => {
    const slates = getFantasySlateWindows("salary_cap_daily");
    for (const slate of slates) {
      expect(slate.match_count).toBeGreaterThan(0);
    }
  });

  it("weekly slates aggregate match counts from daily slates", () => {
    const dailySlates = getFantasySlateWindows("salary_cap_daily");
    const weeklySlates = getFantasySlateWindows("salary_cap_weekly");
    const totalDailyMatches = dailySlates.reduce((sum, s) => sum + s.match_count, 0);
    const totalWeeklyMatches = weeklySlates.reduce((sum, s) => sum + s.match_count, 0);

    expect(totalWeeklyMatches).toBe(totalDailyMatches);
  });

  it("season slate aggregates all match counts", () => {
    const dailySlates = getFantasySlateWindows("salary_cap_daily");
    const seasonSlates = getFantasySlateWindows("classic_season_long");
    const totalDailyMatches = dailySlates.reduce((sum, s) => sum + s.match_count, 0);

    expect(seasonSlates[0].match_count).toBe(totalDailyMatches);
  });

  it("weekly slates have properly formatted labels", () => {
    const slates = getFantasySlateWindows("salary_cap_weekly");
    for (const slate of slates) {
      expect(slate.label).toMatch(/^Week \d+/);
      expect(slate.key).toMatch(/^week-\d{2}$/);
    }
  });
});

describe("getFantasyTargetSlate", () => {
  it("returns a matching slate when requestedSlateKey is valid", () => {
    const slates = getFantasySlateWindows("salary_cap_daily");
    const firstKey = slates[0].key;
    const result = getFantasyTargetSlate("salary_cap_daily", firstKey);

    expect(result).not.toBeUndefined();
    expect(result!.key).toBe(firstKey);
  });

  it("ignores an invalid requestedSlateKey and falls through to time-based selection", () => {
    const result = getFantasyTargetSlate(
      "salary_cap_daily",
      "nonexistent-key",
      new Date("2026-03-14T15:00:00.000Z")
    );

    // Should not be the nonexistent key
    expect(result).not.toBeUndefined();
    expect(result!.key).not.toBe("nonexistent-key");
  });

  it("returns the first slate whose ends_at is on or after now", () => {
    const now = new Date("2026-03-14T15:00:00.000Z");
    const result = getFantasyTargetSlate("salary_cap_daily", undefined, now);

    expect(result).not.toBeUndefined();
    expect(new Date(result!.ends_at).getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it("returns the last slate when now is past all ends_at", () => {
    const farFuture = new Date("2099-12-31T23:59:59.000Z");
    const slates = getFantasySlateWindows("salary_cap_daily");
    const result = getFantasyTargetSlate("salary_cap_daily", undefined, farFuture);

    expect(result!.key).toBe(slates[slates.length - 1].key);
  });

  it("works with a league record argument", () => {
    const league = makeLeague({ contest_horizon: "daily" });
    const result = getFantasyTargetSlate(league, undefined, new Date("2026-04-01T00:00:00.000Z"));

    expect(result).not.toBeUndefined();
  });
});

describe("getFantasyDefaultLockAt", () => {
  it("returns the lock_at of the first slate window for daily", () => {
    const slates = getFantasySlateWindows("salary_cap_daily");
    const lockAt = getFantasyDefaultLockAt("salary_cap_daily");

    expect(lockAt).toBe(slates[0].lock_at);
  });

  it("returns the lock_at of the first weekly window", () => {
    const slates = getFantasySlateWindows("salary_cap_weekly");
    const lockAt = getFantasyDefaultLockAt("salary_cap_weekly");

    expect(lockAt).toBe(slates[0].lock_at);
  });
});

describe("getFantasySlateStatus", () => {
  it("returns 'upcoming' when now is before starts_at", () => {
    const slate = makeSlate({ starts_at: "2099-12-31T00:00:00.000Z" });
    const status = getFantasySlateStatus(slate, new Date("2026-01-01T00:00:00.000Z"));

    expect(status).toBe("upcoming");
  });

  it("returns 'live' when now is between starts_at and ends_at", () => {
    const slate = makeSlate({
      starts_at: "2026-03-14T13:00:00.000Z",
      ends_at: "2026-03-15T01:00:00.000Z",
    });
    const status = getFantasySlateStatus(slate, new Date("2026-03-14T18:00:00.000Z"));

    expect(status).toBe("live");
  });

  it("returns 'complete' when now is after ends_at", () => {
    const slate = makeSlate({
      starts_at: "2020-01-01T00:00:00.000Z",
      ends_at: "2020-01-02T00:00:00.000Z",
    });
    const status = getFantasySlateStatus(slate, new Date("2026-01-01T00:00:00.000Z"));

    expect(status).toBe("complete");
  });

  it("returns 'live' when now equals starts_at exactly", () => {
    const slate = makeSlate({
      starts_at: "2026-03-14T13:00:00.000Z",
      ends_at: "2026-03-15T01:00:00.000Z",
    });
    const status = getFantasySlateStatus(slate, new Date("2026-03-14T13:00:00.000Z"));

    expect(status).toBe("live");
  });

  it("returns 'live' when now equals ends_at exactly", () => {
    const slate = makeSlate({
      starts_at: "2026-03-14T13:00:00.000Z",
      ends_at: "2026-03-15T01:00:00.000Z",
    });
    const status = getFantasySlateStatus(slate, new Date("2026-03-15T01:00:00.000Z"));

    expect(status).toBe("live");
  });

  it("uses current time by default", () => {
    const slate = makeSlate({
      starts_at: "2020-01-01T00:00:00.000Z",
      ends_at: "2020-01-02T00:00:00.000Z",
    });
    const status = getFantasySlateStatus(slate);

    expect(status).toBe("complete");
  });
});

describe("formatFantasySlateRange", () => {
  it("formats a same-month range with a dash", () => {
    const slate = makeSlate({
      starts_at: "2026-03-14T13:30:00.000Z",
      ends_at: "2026-03-15T01:45:00.000Z",
      match_count: 5,
    });
    const formatted = formatFantasySlateRange(slate);

    expect(formatted).toContain("Mar");
    expect(formatted).toContain("5 matches");
  });

  it("uses singular 'match' for a single-match slate", () => {
    const slate = makeSlate({
      starts_at: "2026-03-13T21:00:00.000Z",
      ends_at: "2026-03-14T01:00:00.000Z",
      match_count: 1,
    });
    const formatted = formatFantasySlateRange(slate);

    expect(formatted).toContain("1 match");
    expect(formatted).not.toContain("1 matches");
  });

  it("formats a cross-month range with both month abbreviations", () => {
    const slate = makeSlate({
      starts_at: "2026-03-29T20:00:00.000Z",
      ends_at: "2026-04-01T00:00:00.000Z",
      match_count: 3,
    });
    const formatted = formatFantasySlateRange(slate);

    expect(formatted).toContain("Mar");
    expect(formatted).toContain("Apr");
  });
});
