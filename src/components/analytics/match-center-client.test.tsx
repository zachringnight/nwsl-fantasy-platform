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

  it("announces filtered counts and distinguishes filtered-empty from no data", () => {
    render(
      <MatchCenterClient
        matches={[
          match("completed-match", "completed"),
          match("upcoming-match", "upcoming"),
        ]}
        season="2026"
        source="Official NWSL"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "2 of 2 matches shown"
    );
    const postponedFilter = screen.getByRole("button", {
      name: "postponed",
    });
    fireEvent.click(postponedFilter);

    expect(postponedFilter).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0 of 2 matches shown"
    );
    expect(
      screen.getByText(
        "No matches match the current status and matchday filters."
      )
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear match filters" })
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 of 2 matches shown"
    );
    expect(screen.getByRole("button", { name: "all" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
