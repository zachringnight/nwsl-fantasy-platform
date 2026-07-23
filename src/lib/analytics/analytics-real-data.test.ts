import { describe, expect, it } from "vitest";
import {
  getMatchResultsBySeason,
  getRealMatchResults,
} from "./analytics-real-data";

describe("real NWSL match data", () => {
  it("restarts date-based matchday numbering for each season", () => {
    const allMatches = getRealMatchResults();

    for (const season of ["2025", "2026"] as const) {
      const seasonMatches = allMatches.filter((match) =>
        match.date.startsWith(season)
      );
      const earliestDate = seasonMatches
        .map((match) => match.date)
        .sort()[0];
      const openingMatches = seasonMatches.filter(
        (match) => match.date === earliestDate
      );

      expect(openingMatches.length).toBeGreaterThan(0);
      expect(openingMatches.every((match) => match.matchday === 1)).toBe(true);
      expect(
        getMatchResultsBySeason(season)
          .filter((match) => match.date === earliestDate)
          .every((match) => match.matchday === 1)
      ).toBe(true);
    }
  });
});
