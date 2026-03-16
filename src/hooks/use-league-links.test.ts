import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useLeagueLinks } from "./use-league-links";

describe("useLeagueLinks", () => {
  it("returns all league navigation links", () => {
    const { result } = renderHook(() => useLeagueLinks("abc-123"));
    const links = result.current;

    expect(links.home).toBe("/leagues/abc-123");
    expect(links.draft).toBe("/leagues/abc-123/draft");
    expect(links.draftRoom).toBe("/leagues/abc-123/draft/room");
    expect(links.draftRecap).toBe("/leagues/abc-123/draft/recap");
    expect(links.team).toBe("/leagues/abc-123/team");
    expect(links.players).toBe("/leagues/abc-123/players");
    expect(links.matchup).toBe("/leagues/abc-123/matchup");
    expect(links.standings).toBe("/leagues/abc-123/standings");
    expect(links.transactions).toBe("/leagues/abc-123/transactions");
    expect(links.settings).toBe("/leagues/abc-123/settings");
    expect(links.chat).toBe("/leagues/abc-123/chat");
    expect(links.achievements).toBe("/leagues/abc-123/achievements");
    expect(links.trades).toBe("/leagues/abc-123/trades");
  });

  it("memoizes links for same leagueId", () => {
    const { result, rerender } = renderHook(
      ({ id }) => useLeagueLinks(id),
      { initialProps: { id: "same-id" } }
    );

    const first = result.current;
    rerender({ id: "same-id" });
    expect(result.current).toBe(first);
  });

  it("returns new links when leagueId changes", () => {
    const { result, rerender } = renderHook(
      ({ id }) => useLeagueLinks(id),
      { initialProps: { id: "id-1" } }
    );

    const first = result.current;
    rerender({ id: "id-2" });
    expect(result.current).not.toBe(first);
    expect(result.current.home).toBe("/leagues/id-2");
  });
});
