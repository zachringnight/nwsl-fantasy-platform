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
    expect(output.completedRegularSeasonCount).toBe(1);
    expect(output.completedNonRegularSeasonCount).toBe(0);
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

  it("marks season rows beyond the known regular-season footprint as non-regular season", () => {
    const teams = Array.from({ length: 14 }, (_, index) => `Team ${index + 1}`);
    const regularSeasonMatches: EspnModelMatch[] = Array.from({ length: 182 }, (_, index) => ({
      matchId: `regular-${index + 1}`,
      date: `2025-${String(Math.floor(index / 28) + 3).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      homeTeam: teams[index % teams.length],
      awayTeam: teams[(index + 1) % teams.length],
      homeGoals: index % 4,
      awayGoals: (index + 1) % 3,
      status: "completed",
      venue: "Test Stadium",
    }));
    const playoffMatch: EspnModelMatch = {
      matchId: "playoff-1",
      date: "2025-11-08",
      homeTeam: teams[0],
      awayTeam: teams[1],
      homeGoals: 2,
      awayGoals: 0,
      status: "completed",
      venue: "Inter&Co Stadium",
    };

    const output = buildModelInputCsvs([...regularSeasonMatches, playoffMatch], []);

    expect(output.completedRegularSeasonCount).toBe(182);
    expect(output.completedNonRegularSeasonCount).toBe(1);
    expect(output.matchesCsv).toContain("regular-182,2025-09-14,2025,NWSL,true");
    expect(output.matchesCsv).toContain("playoff-1,2025-11-08,2025,NWSL,false");
  });
});
