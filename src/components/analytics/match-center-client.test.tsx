import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchResult } from "@/types/analytics";
import { MatchCenterClient } from "./match-center-client";

const navigation = vi.hoisted(() => ({
  pathname: "/analytics/matches",
  query: "",
  pushed: [] as string[],
}));
const trackProductEvent = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    push: (href: string) => {
      navigation.pushed.push(href);
      navigation.query = href.split("?")[1] ?? "";
    },
  }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock("@/lib/analytics/events", () => ({
  trackProductEvent,
}));

function match(
  matchId: string,
  status: MatchResult["status"],
  date = "2026-07-26",
  matchday = 18
): MatchResult {
  return {
    matchId,
    date,
    matchday,
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
  beforeEach(() => {
    navigation.query = "";
    navigation.pushed = [];
    trackProductEvent.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels postponed and canceled fixtures without showing scores", () => {
    const view = render(
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
    view.rerender(
      <MatchCenterClient
        matches={[
          match("postponed-match", "postponed"),
          match("canceled-match", "canceled"),
        ]}
        season="2026"
        source="Official NWSL"
      />
    );
    expect(screen.queryByText("Home postponed-match")).not.toBeInTheDocument();
    expect(screen.getByText("Home canceled-match")).toBeInTheDocument();
  });

  it("announces filtered counts and distinguishes filtered-empty from no data", () => {
    const matches = [
      match("completed-match", "completed"),
      match("upcoming-match", "upcoming"),
    ];
    const view = render(
      <MatchCenterClient
        matches={matches}
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
    view.rerender(
      <MatchCenterClient
        matches={matches}
        season="2026"
        source="Official NWSL"
      />
    );

    expect(
      screen.getByRole("button", { name: "postponed" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0 of 2 matches shown"
    );
    expect(
      screen.getByText(
        "No matches match the current status and date filters."
      )
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear match filters" })
    );
    view.rerender(
      <MatchCenterClient
        matches={matches}
        season="2026"
        source="Official NWSL"
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 of 2 matches shown"
    );
    expect(screen.getByRole("button", { name: "all" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("defaults to the next active match date instead of a pseudo-matchday", () => {
    render(
      <MatchCenterClient
        matches={[
          match("later", "upcoming", "2026-07-28", 19),
          match("past", "completed", "2026-07-25", 18),
          match("next", "upcoming", "2026-07-27", 18),
        ]}
        season="2026"
        source="Official NWSL"
      />
    );

    expect(screen.getByLabelText("Filter matches by date")).toHaveValue("next");
    expect(screen.getByText("Home next")).toBeInTheDocument();
    expect(screen.queryByText("Home later")).not.toBeInTheDocument();
    expect(screen.queryByText("Home past")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Monday, Jul 27"
    );
    expect(screen.queryByText(/Matchday 18/i)).not.toBeInTheDocument();
  });

  it("hydrates filters from the URL, sorts stably, and preserves season", () => {
    navigation.query =
      "season=2026&date=all&status=completed&order=desc&matchday=99";
    const matches = [
      match("early-first", "completed", "2026-07-25", 17),
      match("late", "completed", "2026-07-28", 19),
      match("early-second", "completed", "2026-07-25", 17),
      match("future", "upcoming", "2026-07-29", 20),
    ];
    const view = render(
      <MatchCenterClient
        matches={matches}
        season="2026"
        source="Official NWSL"
      />
    );

    expect(screen.getByLabelText("Sort match dates")).toHaveValue("desc");
    expect(screen.queryByText("Home future")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("article").map((card) => card.textContent)
    ).toEqual([
      expect.stringContaining("Home late"),
      expect.stringContaining("Home early-first"),
      expect.stringContaining("Home early-second"),
    ]);

    fireEvent.change(screen.getByLabelText("Filter matches by date"), {
      target: { value: "2026-07-25" },
    });

    expect(navigation.pushed.at(-1)).toBe(
      "/analytics/matches?season=2026&date=2026-07-25&status=completed&order=desc"
    );

    view.rerender(
      <MatchCenterClient
        matches={matches}
        season="2026"
        source="Official NWSL"
      />
    );
    expect(screen.queryByText("Home late")).not.toBeInTheDocument();
    expect(screen.getByText("Home early-first")).toBeInTheDocument();

    navigation.query =
      "season=2026&date=all&status=completed&order=desc";
    view.rerender(
      <MatchCenterClient
        matches={matches}
        season="2026"
        source="Official NWSL"
      />
    );
    expect(screen.getByText("Home late")).toBeInTheDocument();
  });

  it("shows the policy 2.5 total ahead of alternate totals lines", () => {
    render(
      <MatchCenterClient
        matches={[match("priced-match", "upcoming")]}
        season="2026"
        source="Official NWSL"
        matchOdds={[
          {
            matchId: "priced-match",
            sportsbook: "DraftKings",
            marketType: "total",
            line: 1.5,
            homeOdds: null,
            drawOdds: null,
            awayOdds: null,
            overOdds: 1.2,
            underOdds: 4.4,
          },
          {
            matchId: "priced-match",
            sportsbook: "DraftKings",
            marketType: "total",
            line: 2.5,
            homeOdds: null,
            drawOdds: null,
            awayOdds: null,
            overOdds: 1.81,
            underOdds: 1.86,
          },
        ]}
      />
    );

    expect(screen.getByText("Total 2.5")).toBeInTheDocument();
    expect(screen.getByText("O -123 · U -116")).toBeInTheDocument();
    expect(screen.queryByText("Total 1.5")).not.toBeInTheDocument();
  });

  it("tracks one match-center open per match even when both detail links are clicked", () => {
    render(
      <MatchCenterClient
        matches={[match("tracked-match", "upcoming")]}
        season="2026"
        source="Official NWSL"
      />
    );

    fireEvent.click(
      screen.getByRole("link", {
        name: "Open Home tracked-match vs Away tracked-match",
      })
    );
    fireEvent.click(screen.getByRole("link", { name: "Match details" }));

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith("match_center_opened", {
      match_id: "tracked-match",
    });
  });
});
