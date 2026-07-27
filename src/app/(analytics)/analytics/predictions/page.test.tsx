import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchPrediction } from "@/types/analytics";

const mocks = vi.hoisted(() => ({
  getMatchPredictions: vi.fn(),
  getLiveModelBoard: vi.fn(),
}));

vi.mock("@/components/common/app-shell", () => ({
  AppShell: ({
    description,
    children,
  }: {
    description: string;
    children: React.ReactNode;
  }) => (
    <main>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock("@/components/analytics/live-model-picks", () => ({
  LiveModelPicks: () => <div>Live 2026 model board</div>,
}));

vi.mock("@/components/analytics/match-prediction-browser", () => ({
  MatchPredictionBrowser: ({
    predictions,
    season,
  }: {
    predictions: MatchPrediction[];
    season: string;
  }) => (
    <div>
      {season} prediction browser: {predictions.length}
    </div>
  ),
}));

vi.mock("@/lib/analytics/general-predictions-data", () => ({
  getMatchPredictions: mocks.getMatchPredictions,
}));

vi.mock("@/lib/analytics/live-model-board", () => ({
  getLiveModelBoard: mocks.getLiveModelBoard,
}));

import PredictionsPage from "./page";

function prediction(matchId: string, date: string): MatchPrediction {
  return {
    matchId,
    date,
    homeTeam: "Home",
    homeTeamId: "home",
    awayTeam: "Away",
    awayTeamId: "away",
    homeProb: 0.5,
    drawProb: 0.25,
    awayProb: 0.25,
    bttsYesProb: 0.5,
    overUnder: {},
    asianHandicap: {},
    lambdaHome: 1.5,
    lambdaAway: 1,
    scoreMatrix: [],
    model: "dixon_coles",
    timestamp: `${date}T12:00:00Z`,
  };
}

describe("PredictionsPage season routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMatchPredictions.mockReturnValue([
      prediction("archive", "2025-10-01"),
      prediction("current", "2026-07-26"),
    ]);
    mocks.getLiveModelBoard.mockResolvedValue({ run: { status: "no_bet" } });
  });

  it("keeps the 2026 live board out of the 2025 archive", async () => {
    render(
      await PredictionsPage({
        searchParams: Promise.resolve({ season: "2025" }),
      })
    );

    expect(screen.queryByText("Live 2026 model board")).not.toBeInTheDocument();
    expect(screen.getByText("2025 prediction browser: 1")).toBeInTheDocument();
    expect(mocks.getLiveModelBoard).not.toHaveBeenCalled();
  });

  it("shows only current-season projections alongside the live board", async () => {
    render(
      await PredictionsPage({
        searchParams: Promise.resolve({ season: "2026" }),
      })
    );

    expect(screen.getByText("Live 2026 model board")).toBeInTheDocument();
    expect(screen.getByText("2026 prediction browser: 1")).toBeInTheDocument();
    expect(mocks.getLiveModelBoard).toHaveBeenCalledTimes(1);
  });
});
