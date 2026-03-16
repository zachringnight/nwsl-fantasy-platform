import { describe, it, expect } from "vitest";
import { buildLeagueLinks } from "./league-links";

describe("buildLeagueLinks", () => {
  it("generates all league links for a given id", () => {
    const links = buildLeagueLinks("test-league");

    expect(links.home).toBe("/leagues/test-league");
    expect(links.draft).toBe("/leagues/test-league/draft");
    expect(links.draftRoom).toBe("/leagues/test-league/draft/room");
    expect(links.draftRecap).toBe("/leagues/test-league/draft/recap");
    expect(links.team).toBe("/leagues/test-league/team");
    expect(links.players).toBe("/leagues/test-league/players");
    expect(links.matchup).toBe("/leagues/test-league/matchup");
    expect(links.standings).toBe("/leagues/test-league/standings");
    expect(links.transactions).toBe("/leagues/test-league/transactions");
    expect(links.settings).toBe("/leagues/test-league/settings");
    expect(links.chat).toBe("/leagues/test-league/chat");
    expect(links.achievements).toBe("/leagues/test-league/achievements");
    expect(links.trades).toBe("/leagues/test-league/trades");
  });

  it("handles UUID-style ids", () => {
    const links = buildLeagueLinks("550e8400-e29b-41d4-a716-446655440000");
    expect(links.home).toBe("/leagues/550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns 13 link entries", () => {
    const links = buildLeagueLinks("any");
    expect(Object.keys(links)).toHaveLength(13);
  });
});
