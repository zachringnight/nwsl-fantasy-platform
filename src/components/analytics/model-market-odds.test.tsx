import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelMarketOdds } from "./model-market-odds";
import type {
  LiveMatchOdds,
  LiveModelSlateRow,
} from "@/lib/analytics/live-model-board";

const officialMatchId =
  "nwsl::Football_Match::0123456789abcdef0123456789abcdef";

function totalOdds(): LiveMatchOdds {
  return {
    officialMatchId,
    matchId: "401853951",
    matchDate: "2026-07-26",
    homeTeam: "San Diego Wave FC",
    awayTeam: "Seattle Reign FC",
    sportsbook: "DraftKings",
    quoteTimestamp: "2026-07-26T20:00:00Z",
    marketType: "total",
    line: 2.5,
    homeOdds: null,
    drawOdds: null,
    awayOdds: null,
    overOdds: 1.91,
    underOdds: 1.95,
    sourceType: "current",
    quoteAgeMinutes: 4,
    isFresh: true,
  };
}

function slateRow(): LiveModelSlateRow {
  return {
    officialMatchId,
    matchId: "401853951",
    matchDate: "2026-07-26",
    homeTeam: "San Diego Wave FC",
    awayTeam: "Seattle Reign FC",
    sportsbook: "DraftKings",
    quoteTimestamp: "2026-07-26T20:00:00Z",
    line: 2.5,
    overOdds: 1.91,
    underOdds: 1.95,
    modelProbability: 0.47,
    marketNoVigProbability: 0.505,
    probabilityEdge: -0.035,
    expectedValue: -0.102,
    confidence: 0.03,
    quoteAgeMinutes: 4,
    quoteIsFresh: true,
    firstSeenContractOk: true,
    actionable: false,
    reason: "edge_below_threshold",
    stakePct: 0,
  };
}

describe("ModelMarketOdds", () => {
  it("shows the captured prices and the exact no-bet decision", () => {
    render(<ModelMarketOdds odds={[totalOdds()]} modelRow={slateRow()} />);

    expect(screen.getByText("DraftKings")).toBeInTheDocument();
    expect(screen.getByText("-110")).toBeInTheDocument();
    expect(screen.getByText("-105")).toBeInTheDocument();
    expect(screen.getByText(/American prices captured/i)).toBeInTheDocument();
    expect(screen.getByText("Edge Below Threshold")).toBeInTheDocument();
    expect(screen.getByText("47.0%")).toBeInTheDocument();
    expect(screen.getByText("50.5%")).toBeInTheDocument();
  });

  it("is explicit when no verifiable market snapshot exists", () => {
    render(<ModelMarketOdds odds={[]} />);

    expect(screen.getByText("Odds not posted")).toBeInTheDocument();
    expect(
      screen.getByText(/records no price-based pick/i)
    ).toBeInTheDocument();
  });

  it("labels stored pre-match context as archived after the match", () => {
    render(
      <ModelMarketOdds
        odds={[totalOdds()]}
        modelRow={slateRow()}
        heading="Archived pre-match odds"
        archived
      />
    );

    expect(screen.getByText("Archived pre-match odds")).toBeInTheDocument();
    expect(screen.getByText("Archived quote")).toBeInTheDocument();
    expect(screen.queryByText("Fresh quote")).not.toBeInTheDocument();
  });
});
