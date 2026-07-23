import { describe, expect, it } from "vitest";
import {
  getFantasyLeagueModeFields,
  getFantasyModeConfig,
  getFantasyModeOptions,
} from "./fantasy-modes";

describe("fantasy mode configuration", () => {
  it("covers all four variants with internally consistent fields", () => {
    const options = getFantasyModeOptions();
    expect(options.map((option) => option.variant)).toEqual([
      "classic_season_long",
      "salary_cap_season_long",
      "salary_cap_weekly",
      "salary_cap_daily",
    ]);

    for (const option of options) {
      expect(getFantasyModeConfig(option.variant)).toEqual(
        expect.objectContaining({
          rosterBuildMode: option.rosterBuildMode,
          contestHorizon: option.contestHorizon,
        })
      );
      expect(getFantasyLeagueModeFields(option.variant)).toMatchObject({
        roster_build_mode: option.rosterBuildMode,
        contest_horizon: option.contestHorizon,
      });
    }
  });

  it("keeps classic exclusive and every salary mode shared", () => {
    expect(getFantasyModeConfig("classic_season_long").usesSalaryCap).toBe(false);
    for (const variant of [
      "salary_cap_season_long",
      "salary_cap_weekly",
      "salary_cap_daily",
    ] as const) {
      expect(getFantasyModeConfig(variant)).toMatchObject({
        usesSalaryCap: true,
        playerOwnershipMode: "shared",
      });
    }
  });
});
