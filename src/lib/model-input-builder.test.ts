import { describe, expect, it } from "vitest";

import { buildModelInputCsvs, type EspnModelMatch } from "./model-input-builder";

const completedMatch: EspnModelMatch = {
  matchId: "completed-1",
  date: "2026-05-10",
  homeTeam: "Orlando Pride",
  awayTeam: "Kansas City Current",
  homeGoals: 2,
  awayGoals: 1,
  status: "completed",
  venue: "Inter&Co Stadium",
};

const upcomingMatch: EspnModelMatch = {
  matchId: "upcoming-1",
  date: "2026-05-28",
  homeTeam: "Portland Thorns FC",
  awayTeam: "Seattle Reign FC",
  homeGoals: 0,
  awayGoals: 0,
  status: "upcoming",
  venue: "Providence Park",
};

describe("buildModelInputCsvs", () => {
  it("separates completed training rows from upcoming prediction fixtures", () => {
    const output = buildModelInputCsvs([completedMatch], [upcomingMatch]);

    expect(output.completedCount).toBe(1);
    expect(output.upcomingCount).toBe(1);
    expect(output.seasonCoverage).toEqual([2026]);
    expect(output.completedSeasonCoverage).toEqual([2026]);
    expect(output.upcomingSeasonCoverage).toEqual([2026]);
    expect(output.completedDateRange).toEqual(["2026-05-10", "2026-05-10"]);
    expect(output.upcomingDateRange).toEqual(["2026-05-28", "2026-05-28"]);
    expect(output.matchesCsv).toContain("completed-1,2026-05-10,2026");
    expect(output.matchesCsv).not.toContain("upcoming-1");
    expect(output.upcomingCsv).toContain("upcoming-1,2026-05-28,2026");
    expect(output.upcomingCsv).not.toContain("completed-1");
    expect(output.upcomingCsv).toContain("Portland Thorns FC,Seattle Reign FC");
  });
});
