import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchPredictionBrowser } from "./match-prediction-browser";
import type { MatchPrediction } from "@/types/analytics";

const navigation = vi.hoisted(() => ({
  pathname: "/analytics/predictions",
  query: "",
  pushed: [] as string[],
}));

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

function prediction(
  matchId: string,
  date: string,
  homeTeam: string,
  awayTeam: string
): MatchPrediction {
  return {
    matchId,
    date,
    homeTeam,
    homeTeamId: `${matchId}-home`,
    awayTeam,
    awayTeamId: `${matchId}-away`,
    homeProb: 0.48,
    drawProb: 0.27,
    awayProb: 0.25,
    bttsYesProb: 0.56,
    overUnder: {
      "2.5": { over: 0.52, under: 0.48 },
    },
    asianHandicap: {},
    lambdaHome: 1.5,
    lambdaAway: 1.1,
    scoreMatrix: [],
    model: "dixon_coles",
    timestamp: "2026-07-26T12:00:00Z",
  };
}

describe("MatchPredictionBrowser", () => {
  beforeEach(() => {
    navigation.query = "";
    navigation.pushed = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters model cards by match date and reports the visible count", () => {
    const predictions = [
      prediction(
        "match-1",
        "2026-07-26",
        "North Carolina Courage",
        "Utah Royals"
      ),
      prediction(
        "match-2",
        "2026-07-27",
        "Angel City FC",
        "Racing Louisville FC"
      ),
      prediction(
        "match-3",
        "2026-07-27",
        "Orlando Pride",
        "Gotham FC"
      ),
    ];
    const view = render(
      <MatchPredictionBrowser
        predictions={predictions}
        season="2026"
      />
    );

    expect(screen.getByText("1 match")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "North Carolina Courage" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Match date"), {
      target: { value: "2026-07-27" },
    });
    expect(navigation.pushed.at(-1)).toBe(
      "/analytics/predictions?date=2026-07-27"
    );
    view.rerender(
      <MatchPredictionBrowser predictions={predictions} season="2026" />
    );

    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "North Carolina Courage" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Angel City FC" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orlando Pride" })).toBeInTheDocument();
  });

  it("hydrates all-date descending order and retains tie order", () => {
    navigation.query = "season=2026&date=all&order=desc";
    const predictions = [
      prediction("early-first", "2026-07-26", "Early First", "Opponent A"),
      prediction("late", "2026-07-28", "Late", "Opponent B"),
      prediction("early-second", "2026-07-26", "Early Second", "Opponent C"),
    ];
    const view = render(
      <MatchPredictionBrowser predictions={predictions} season="2026" />
    );

    expect(screen.getByText("3 matches")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort prediction dates")).toHaveValue("desc");
    expect(
      screen.getAllByRole("article").map((card) => card.textContent)
    ).toEqual([
      expect.stringContaining("Late"),
      expect.stringContaining("Early First"),
      expect.stringContaining("Early Second"),
    ]);

    fireEvent.change(screen.getByLabelText("Sort prediction dates"), {
      target: { value: "asc" },
    });
    expect(navigation.pushed.at(-1)).toBe(
      "/analytics/predictions?season=2026&date=all&order=asc"
    );

    view.rerender(
      <MatchPredictionBrowser predictions={predictions} season="2026" />
    );
    expect(
      screen.getAllByRole("article").map((card) => card.textContent)
    ).toEqual([
      expect.stringContaining("Early First"),
      expect.stringContaining("Early Second"),
      expect.stringContaining("Late"),
    ]);
  });

  it("keeps the selected season on entity links", () => {
    render(
      <MatchPredictionBrowser
        predictions={[
          prediction(
            "archive-match",
            "2025-10-01",
            "Archive Team",
            "Other Team"
          ),
        ]}
        season="2025"
      />
    );

    expect(screen.getByRole("link", { name: "Archive Team" })).toHaveAttribute(
      "href",
      "/analytics/teams/archive-match-home?season=2025"
    );
    expect(
      screen.getByRole("link", { name: "Full prediction" })
    ).toHaveAttribute(
      "href",
      "/analytics/predictions/archive-match?season=2025"
    );
  });
});
