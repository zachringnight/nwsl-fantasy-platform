import { describe, expect, it } from "vitest";
import {
  modelPublishPayloadSchema,
  type ModelPublishPayload,
  validateModelPublishInvariants,
} from "./publish-payload";

function payload(): ModelPublishPayload {
  const generatedAt = new Date().toISOString();
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
        matchId: "match-1",
        matchDate: "2026-07-27",
        homeTeam: "Home FC",
        awayTeam: "Away FC",
        market: "total_over",
        side: "over",
        sportsbook: "ExampleBook",
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
        quoteAgeMinutes: 2,
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
      matchId: "match-1",
      matchDate: "2026-07-27",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      market: "total_over" as const,
      side: "over" as const,
      sportsbook: "ExampleBook",
      quoteTimestamp: candidate.run.generatedAt,
      firstSeenTimestamp: candidate.run.generatedAt,
      line: 2.5,
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
});
