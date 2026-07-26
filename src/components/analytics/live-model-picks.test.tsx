import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveModelPicks } from "./live-model-picks";
import type { LiveModelBoard } from "@/lib/analytics/live-model-board";

function board(): LiveModelBoard {
  return {
    runId: "run-1",
    policyId: "nwsl-totals-open-over-v1",
    policyStatus: "ready_for_capped_forward_use",
    modelFamily: "team_ratings_poisson",
    artifactVersion: "artifact-1",
    runStatus: "no_bet",
    generatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    matchesInWindow: 22,
    pricedMatches: 5,
    actionablePicks: 0,
    stakeCapBankrollPct: 0.25,
    isStale: false,
    reasonCounts: {
      edge_below_threshold: 4,
      missing_current_total_price: 17,
    },
    sourceHealth: {
      authoritative: { status: "healthy" },
    },
    forwardResults: {
      settled: 0,
      pending: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      pnl_units: 0,
      roi_units: 0,
    },
    evidenceSummary: {
      bets: 30,
      wins: 22,
      losses: 8,
      roiUnits: 0.3561666667,
    },
    slate: [],
    picks: [],
  };
}

describe("LiveModelPicks", () => {
  it("separates the current no-bet state from the retrospective record", () => {
    render(<LiveModelPicks board={board()} />);

    expect(
      screen.getByText("NO BET — policy thresholds not cleared")
    ).toBeInTheDocument();
    expect(screen.getByText("22-8")).toBeInTheDocument();
    expect(
      screen.getByText("35.6% flat-stake ROI; retrospective, not live.")
    ).toBeInTheDocument();
    expect(screen.getByText("0-0")).toBeInTheDocument();
  });

  it("suppresses current recommendations for stale snapshots", () => {
    render(<LiveModelPicks board={{ ...board(), isStale: true }} />);

    expect(screen.getByText("No current recommendation")).toBeInTheDocument();
    expect(
      screen.queryByText("NO BET — policy thresholds not cleared")
    ).not.toBeInTheDocument();
  });

  it("connects a live pick to its match and both team profiles", () => {
    const liveBoard = board();
    liveBoard.slate = [
      {
        matchId: "401853951",
        matchDate: "2026-07-26",
        homeTeam: "San Diego Wave FC",
        awayTeam: "Seattle Reign FC",
        sportsbook: "FoxSports",
        quoteTimestamp: new Date().toISOString(),
        line: 2.5,
        overOdds: 1.91,
        modelProbability: 0.61,
        probabilityEdge: 0.06,
        expectedValue: 0.08,
        confidence: 0.05,
        actionable: true,
        reason: "thresholds_cleared",
        stakePct: 0.0025,
      },
    ];

    render(<LiveModelPicks board={liveBoard} />);

    expect(screen.getByRole("link", { name: "San Diego Wave FC" })).toHaveAttribute(
      "href",
      "/analytics/teams/san-diego-wave-fc"
    );
    expect(screen.getByRole("link", { name: "Seattle Reign FC" })).toHaveAttribute(
      "href",
      "/analytics/teams/seattle-reign-fc"
    );
    expect(screen.getByRole("link", { name: "Open match page" })).toHaveAttribute(
      "href",
      "/analytics/matches/401853951"
    );
  });
});
