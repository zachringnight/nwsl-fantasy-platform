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
      draftkings_apify: { status: "healthy" },
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
    odds: [],
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
        officialMatchId:
          "nwsl::Football_Match::0123456789abcdef0123456789abcdef",
        matchId: "401853951",
        matchDate: "2026-07-26",
        homeTeam: "San Diego Wave FC",
        awayTeam: "Seattle Reign FC",
        sportsbook: "FoxSports",
        quoteTimestamp: new Date().toISOString(),
        line: 2.5,
        overOdds: 1.91,
        underOdds: 1.91,
        modelProbability: 0.61,
        marketNoVigProbability: 0.5,
        probabilityEdge: 0.06,
        expectedValue: 0.08,
        confidence: 0.05,
        quoteAgeMinutes: 2,
        quoteIsFresh: true,
        firstSeenContractOk: true,
        actionable: true,
        reason: "accepted",
        stakePct: 0.0025,
      },
    ];

    render(<LiveModelPicks board={liveBoard} />);

    expect(
      screen.getAllByRole("link", { name: "San Diego Wave FC" })[0]
    ).toHaveAttribute("href", "/analytics/teams/san-diego-wave-fc");
    expect(
      screen.getAllByRole("link", { name: "Seattle Reign FC" })[0]
    ).toHaveAttribute("href", "/analytics/teams/seattle-reign-fc");
    expect(screen.getByRole("link", { name: "Open match page" })).toHaveAttribute(
      "href",
      "/analytics/matches/401853951"
    );
  });

  it("shows every priced row, including a no-bet decision", () => {
    const liveBoard = board();
    liveBoard.slate = [
      {
        officialMatchId:
          "nwsl::Football_Match::fedcba9876543210fedcba9876543210",
        matchId: "401853952",
        matchDate: "2026-07-27",
        homeTeam: "Angel City FC",
        awayTeam: "Racing Louisville FC",
        sportsbook: "DraftKings",
        quoteTimestamp: new Date().toISOString(),
        line: 2.5,
        overOdds: 1.88,
        underOdds: 1.94,
        modelProbability: 0.47,
        marketNoVigProbability: 0.51,
        probabilityEdge: -0.04,
        expectedValue: -0.12,
        confidence: 0.03,
        quoteAgeMinutes: 5,
        quoteIsFresh: true,
        firstSeenContractOk: true,
        actionable: false,
        reason: "edge_below_threshold",
        stakePct: 0,
      },
    ];

    render(<LiveModelPicks board={liveBoard} />);

    expect(screen.getByText("Totals market decision board")).toBeInTheDocument();
    expect(screen.getByText("DraftKings")).toBeInTheDocument();
    expect(screen.getByText("1.88")).toBeInTheDocument();
    expect(screen.getByText("Edge Below Threshold")).toBeInTheDocument();
  });
});
