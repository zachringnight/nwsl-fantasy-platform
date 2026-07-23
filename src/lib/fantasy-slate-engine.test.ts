import { describe, expect, it } from "vitest";
import {
  getFantasyDefaultLockAt,
  getFantasySlateStatus,
  getFantasySlateWindows,
  getFantasyTargetSlate,
} from "./fantasy-slate-engine";

describe("fantasy slate engine", () => {
  it("returns the correct cadence for every contest mode", () => {
    expect(getFantasySlateWindows("classic_season_long")).toHaveLength(1);
    expect(getFantasySlateWindows("salary_cap_season_long")).toHaveLength(1);
    expect(getFantasySlateWindows("salary_cap_weekly")[0]?.cadence).toBe("weekly");
    expect(getFantasySlateWindows("salary_cap_daily")[0]?.cadence).toBe("daily");
  });

  it("uses inclusive live status at the exact slate end", () => {
    const slate = getFantasySlateWindows("salary_cap_daily")[0]!;
    expect(getFantasySlateStatus(slate, new Date(slate.starts_at))).toBe("live");
    expect(getFantasySlateStatus(slate, new Date(slate.ends_at))).toBe("live");
    expect(
      getFantasySlateStatus(
        slate,
        new Date(new Date(slate.ends_at).getTime() + 1)
      )
    ).toBe("complete");
  });

  it("honors an explicit slate key and exposes the same lock", () => {
    const slates = getFantasySlateWindows("salary_cap_daily");
    const target = slates[2]!;
    expect(
      getFantasyTargetSlate(
        "salary_cap_daily",
        target.key,
        new Date("2030-01-01T00:00:00Z")
      )
    ).toEqual(target);
    expect(getFantasyDefaultLockAt("salary_cap_daily")).toBe(slates[0]!.lock_at);
  });
});
