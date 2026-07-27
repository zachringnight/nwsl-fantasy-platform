import { describe, expect, it } from "vitest";
import {
  modelPublishPayloadSchema,
  type ModelPublishPayload,
  validateModelPublishInvariants,
} from "./publish-payload";

function payload(): ModelPublishPayload {
  const generatedAt = new Date().toISOString();
  const officialMatchId =
    "nwsl::Football_Match::0123456789abcdef0123456789abcdef";
  return {
    schemaVersion: 1,
    run: {
      runKey: `nwsl-totals-open-over-v1:${generatedAt}`,
      policyId: "nwsl-totals-open-over-v1",
      policyStatus: "ready_for_capped_forward_use",
      modelFamily: "team_ratings_poisson",
      artifactVersion: "test-artifact",
      status: "no_bet",
      generatedAt,
      windowStart: "2026-07-26",
      windowEnd: "2026-08-09",
      matchesInWindow: 1,
      pricedMatches: 1,
      actionablePicks: 0,
      stakeCapBankrollPct: 0.25,
      summary: {},
      sourceHealth: {},
      forwardResults: {},
      evidenceSummary: {},
    },
    slate: [
      {
        policyId: "nwsl-totals-open-over-v1",
        officialMatchId,
        matchId: "match-1",
        matchDate: "2026-07-27",
        homeTeam: "Home FC",
        awayTeam: "Away FC",
        market: "total_over",
        side: "over",
        sportsbook: "DraftKings",
        quoteTimestamp: generatedAt,
        firstSeenTimestamp: generatedAt,
        line: 2.5,
        overOdds: 1.95,
        underOdds: 1.9,
        modelProbability: 0.5,
        marketNoVigProbability: 0.49,
        probabilityEdge: 0.01,
        expectedValue: -0.025,
        confidence: 0,
        quoteAgeMinutes: 0,
        quoteIsFresh: true,
        firstSeenContractOk: true,
        pickTier: "no_bet",
        actionable: false,
        reason: "edge_below_threshold",
        stakePct: 0,
        rawRow: {},
      },
    ],
    picks: [],
    odds: [
      {
        officialMatchId,
        matchId: "match-1",
        matchDate: "2026-07-27",
        homeTeam: "Home FC",
        awayTeam: "Away FC",
        sportsbook: "DraftKings",
        quoteTimestamp: generatedAt,
        marketType: "total",
        line: 2.5,
        homeOdds: null,
        drawOdds: null,
        awayOdds: null,
        overOdds: 1.95,
        underOdds: 1.9,
        sourceType: "current",
        quoteAgeMinutes: 0,
        isFresh: true,
        rawRow: {},
      },
    ],
  };
}

describe("model publish payload", () => {
  it("accepts a successful no-bet run", () => {
    const parsed = modelPublishPayloadSchema.parse(payload());
    expect(validateModelPublishInvariants(parsed)).toEqual([]);
  });

  it("rejects an actionable row that violates the quote contract", () => {
    const candidate = payload();
    candidate.run.status = "success";
    candidate.run.actionablePicks = 1;
    candidate.slate[0] = {
      ...candidate.slate[0],
      actionable: true,
      pickTier: "validated_policy_pick",
      reason: "accepted",
      stakePct: 0.0025,
      firstSeenContractOk: false,
    };

    expect(validateModelPublishInvariants(candidate)).toContain(
      "actionable slate row match-1 violates the quote contract"
    );
  });

  it("rejects duplicate locked picks for the same match", () => {
    const candidate = payload();
    const pick = {
      pickKey: "policy:match-1",
      policyId: "nwsl-totals-open-over-v1" as const,
      officialMatchId:
        "nwsl::Football_Match::0123456789abcdef0123456789abcdef",
      matchId: "match-1",
      matchDate: "2026-07-27",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      market: "total_over" as const,
      side: "over" as const,
      sportsbook: "DraftKings" as const,
      quoteTimestamp: candidate.run.generatedAt,
      firstSeenTimestamp: candidate.run.generatedAt,
      line: 2.5 as const,
      overOdds: 2,
      underOdds: 1.9,
      modelProbability: 0.55,
      probabilityEdge: 0.04,
      expectedValue: 0.1,
      confidence: 0.05,
      stakePct: 0.0025,
      lockedAt: candidate.run.generatedAt,
      settlementStatus: "pending" as const,
      result: "pending" as const,
      pnlUnits: null,
      homeGoals90: null,
      awayGoals90: null,
      settledAt: null,
      rawRow: {},
    };
    candidate.picks = [pick, { ...pick, pickKey: "policy:match-1-copy" }];

    expect(validateModelPublishInvariants(candidate)).toContain(
      "multiple locked picks supplied for match match-1"
    );
  });

  it("rejects a priced slate row without the exact published quote", () => {
    const candidate = payload();
    candidate.odds[0].overOdds = 2.01;

    expect(validateModelPublishInvariants(candidate)).toContain(
      "priced slate row match-1 has no exact odds snapshot"
    );
  });

  it("rejects malformed market odds", () => {
    const candidate = payload();
    candidate.odds[0].marketType = "1x2";

    expect(validateModelPublishInvariants(candidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("violates the market contract"),
      ])
    );
  });

  it("rejects a falsified quote age", () => {
    const candidate = payload();
    candidate.odds[0].quoteAgeMinutes = 12;

    expect(validateModelPublishInvariants(candidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("has an invalid supplied quote age"),
      ])
    );
  });

  it("rejects a stale quote even when its supplied age is fresh", () => {
    const candidate = payload();
    candidate.odds[0].quoteTimestamp = new Date(
      Date.parse(candidate.run.generatedAt) - 181 * 60 * 1_000
    ).toISOString();
    candidate.odds[0].quoteAgeMinutes = 1;

    expect(validateModelPublishInvariants(candidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("is outside the publish freshness window"),
      ])
    );
  });

  it("rejects non-DraftKings or non-2.5 priced slate rows at the schema boundary", () => {
    const wrongBook = payload();
    wrongBook.slate[0].sportsbook = "ExampleBook" as "DraftKings";
    expect(modelPublishPayloadSchema.safeParse(wrongBook).success).toBe(false);

    const wrongLine = payload();
    wrongLine.slate[0].line = 3.5 as 2.5;
    expect(modelPublishPayloadSchema.safeParse(wrongLine).success).toBe(false);
  });
});
