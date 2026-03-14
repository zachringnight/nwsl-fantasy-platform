import { describe, expect, it } from "vitest";
import { getFantasyDefaultLockAt } from "./fantasy-slate-engine";
import {
  buildLocalDateTimeInputMin,
  normalizeFantasyLeagueCode,
  normalizeFantasyLeagueName,
  resolveFantasyLeagueStartAt,
  validateFantasyManagerCountTarget,
} from "./fantasy-league-inputs";

describe("fantasy-league-input helpers", () => {
  it("normalizes league names by trimming whitespace", () => {
    expect(normalizeFantasyLeagueName("  Founders   Cup  ")).toBe("Founders Cup");
  });

  it("rejects league names that are too short", () => {
    expect(() => normalizeFantasyLeagueName("ab")).toThrowError(
      "Give your league a name with at least 3 characters."
    );
  });

  it("normalizes league codes to six uppercase characters", () => {
    expect(normalizeFantasyLeagueCode(" ab 12c3 ")).toBe("AB12C3");
  });

  it("rejects league codes that are not six characters", () => {
    expect(() => normalizeFantasyLeagueCode("abc")).toThrowError(
      "Enter the 6-character league code."
    );
  });

  it("accepts valid manager count targets", () => {
    expect(validateFantasyManagerCountTarget(10)).toBe(10);
  });

  it("rejects manager count targets outside the supported range", () => {
    expect(() => validateFantasyManagerCountTarget(7)).toThrowError(
      "Choose a league size between 8 and 12 managers."
    );
  });

  it("requires classic leagues to use a future draft time", () => {
    const localDraftAt = "2026-03-13T12:00";

    expect(
      resolveFantasyLeagueStartAt(
        "classic_season_long",
        localDraftAt,
        new Date("2026-03-13T10:00:00.000Z")
      )
    ).toBe(new Date(localDraftAt).toISOString());
  });

  it("rejects classic league draft times that are in the past", () => {
    const localDraftAt = "2026-03-13T08:00";

    expect(() =>
      resolveFantasyLeagueStartAt(
        "classic_season_long",
        localDraftAt,
        new Date(new Date(localDraftAt).getTime() + 60_000)
      )
    ).toThrowError("Choose a draft time in the future.");
  });

  it("uses the first slate lock for salary-cap leagues", () => {
    expect(resolveFantasyLeagueStartAt("salary_cap_weekly")).toBe(
      getFantasyDefaultLockAt("salary_cap_weekly")
    );
  });

  it("builds a datetime-local min string with minute precision", () => {
    expect(buildLocalDateTimeInputMin(new Date("2026-03-13T18:45:33.000Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
    );
  });
});
