import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MatchResult } from "@/types/analytics";
import { MatchCenterClient } from "./match-center-client";

function match(
  matchId: string,
  status: MatchResult["status"]
): MatchResult {
  return {
    matchId,
    date: "2026-07-26",
    matchday: 18,
    homeTeam: `Home ${matchId}`,
    homeTeamId: `home-${matchId}`,
    awayTeam: `Away ${matchId}`,
    awayTeamId: `away-${matchId}`,
    homeGoals: 0,
    awayGoals: 0,
    homeXg: 0,
    awayXg: 0,
    venue: "Test Ground",
    status,
  };
}

describe("MatchCenterClient", () => {
  it("labels postponed and canceled fixtures without showing scores", () => {
    render(
      <MatchCenterClient
        matches={[
          match("postponed-match", "postponed"),
          match("canceled-match", "canceled"),
        ]}
        season="2026"
        source="Official NWSL"
      />
    );

    const postponedCard = screen
      .getAllByText("Postponed")
      .find((element) => element.closest("article"))
      ?.closest("article");
    const canceledCard = screen
      .getAllByText("Canceled")
      .find((element) => element.closest("article"))
      ?.closest("article");

    expect(postponedCard).toBeTruthy();
    expect(canceledCard).toBeTruthy();
    expect(within(postponedCard as HTMLElement).getAllByText("-")).toHaveLength(2);
    expect(within(canceledCard as HTMLElement).getAllByText("-")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "canceled" }));
    expect(screen.queryByText("Home postponed-match")).not.toBeInTheDocument();
    expect(screen.getByText("Home canceled-match")).toBeInTheDocument();
  });
});
