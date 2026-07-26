import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchPredictionBrowser } from "./match-prediction-browser";
import type { MatchPrediction } from "@/types/analytics";

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
  it("filters model cards by match date and reports the visible count", () => {
    render(
      <MatchPredictionBrowser
        predictions={[
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
        ]}
      />
    );

    expect(screen.getByText("3 matches")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "North Carolina Courage" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Match date"), {
      target: { value: "2026-07-27" },
    });

    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "North Carolina Courage" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Angel City FC" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orlando Pride" })).toBeInTheDocument();
  });
});
