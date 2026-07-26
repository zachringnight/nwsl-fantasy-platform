import { z } from "zod";

const finiteNullable = z.number().finite().nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const jsonObject = z.record(z.string(), z.unknown());

export const modelSlateRowSchema = z.object({
  policyId: z.literal("nwsl-totals-open-over-v1"),
  matchId: z.string().min(1).max(128),
  matchDate: dateOnly,
  homeTeam: z.string().min(1).max(160),
  awayTeam: z.string().min(1).max(160),
  market: z.literal("total_over"),
  side: z.literal("over"),
  sportsbook: z.string().max(120).nullable(),
  quoteTimestamp: z.string().datetime({ offset: true }).nullable(),
  firstSeenTimestamp: z.string().datetime({ offset: true }).nullable(),
  line: finiteNullable,
  overOdds: finiteNullable,
  underOdds: finiteNullable,
  modelProbability: finiteNullable,
  marketNoVigProbability: finiteNullable,
  probabilityEdge: finiteNullable,
  expectedValue: finiteNullable,
  confidence: finiteNullable,
  quoteAgeMinutes: finiteNullable,
  quoteIsFresh: z.boolean().nullable(),
  firstSeenContractOk: z.boolean().nullable(),
  pickTier: z.string().min(1).max(80),
  actionable: z.boolean(),
  reason: z.string().min(1).max(160),
  stakePct: z.number().finite().min(0).max(0.0025),
  rawRow: jsonObject,
});

export const lockedModelPickSchema = z.object({
  pickKey: z.string().min(1).max(320),
  policyId: z.literal("nwsl-totals-open-over-v1"),
  matchId: z.string().min(1).max(128),
  matchDate: dateOnly,
  homeTeam: z.string().min(1).max(160),
  awayTeam: z.string().min(1).max(160),
  market: z.literal("total_over"),
  side: z.literal("over"),
  sportsbook: z.string().min(1).max(120),
  quoteTimestamp: z.string().datetime({ offset: true }),
  firstSeenTimestamp: z.string().datetime({ offset: true }).nullable(),
  line: z.number().finite(),
  overOdds: z.number().finite().gt(1),
  underOdds: finiteNullable,
  modelProbability: z.number().finite().min(0).max(1),
  probabilityEdge: finiteNullable,
  expectedValue: z.number().finite(),
  confidence: z.number().finite().min(0).max(1),
  stakePct: z.number().finite().gt(0).max(0.0025),
  lockedAt: z.string().datetime({ offset: true }),
  settlementStatus: z.enum(["pending", "settled"]),
  result: z.enum(["pending", "win", "loss", "push"]),
  pnlUnits: finiteNullable,
  homeGoals90: finiteNullable,
  awayGoals90: finiteNullable,
  settledAt: z.string().datetime({ offset: true }).nullable(),
  rawRow: jsonObject,
});

export const modelPublishPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  run: z.object({
    runKey: z.string().min(1).max(320),
    policyId: z.literal("nwsl-totals-open-over-v1"),
    policyStatus: z.literal("ready_for_capped_forward_use"),
    modelFamily: z.literal("team_ratings_poisson"),
    artifactVersion: z.string().min(1).max(160),
    status: z.enum(["success", "no_bet"]),
    generatedAt: z.string().datetime({ offset: true }),
    windowStart: dateOnly.nullable(),
    windowEnd: dateOnly.nullable(),
    matchesInWindow: z.number().int().min(0),
    pricedMatches: z.number().int().min(0),
    actionablePicks: z.number().int().min(0),
    stakeCapBankrollPct: z.number().finite().min(0).max(0.25),
    summary: jsonObject,
    sourceHealth: jsonObject,
    forwardResults: jsonObject,
    evidenceSummary: jsonObject,
  }),
  slate: z.array(modelSlateRowSchema).max(500),
  picks: z.array(lockedModelPickSchema).max(500),
});

export type ModelPublishPayload = z.infer<typeof modelPublishPayloadSchema>;

export function validateModelPublishInvariants(payload: ModelPublishPayload): string[] {
  const errors: string[] = [];
  const actionableRows = payload.slate.filter((row) => row.actionable);

  if (actionableRows.length !== payload.run.actionablePicks) {
    errors.push("run actionable count does not match the slate");
  }

  if (
    (payload.run.status === "no_bet" && payload.run.actionablePicks !== 0) ||
    (payload.run.status === "success" && payload.run.actionablePicks === 0)
  ) {
    errors.push("run status does not match the actionable count");
  }

  for (const row of actionableRows) {
    if (
      row.reason !== "accepted" ||
      row.quoteIsFresh !== true ||
      row.firstSeenContractOk !== true ||
      row.line === null ||
      row.overOdds === null ||
      row.modelProbability === null ||
      row.expectedValue === null ||
      row.confidence === null ||
      row.sportsbook === null ||
      row.quoteTimestamp === null
    ) {
      errors.push(`actionable slate row ${row.matchId} violates the quote contract`);
    }
  }

  const uniquePickMatches = new Set<string>();
  for (const pick of payload.picks) {
    if (uniquePickMatches.has(pick.matchId)) {
      errors.push(`multiple locked picks supplied for match ${pick.matchId}`);
    }
    uniquePickMatches.add(pick.matchId);

    if (pick.settlementStatus === "settled" && pick.result === "pending") {
      errors.push(`settled pick ${pick.pickKey} has a pending result`);
    }
    if (pick.settlementStatus === "pending" && pick.result !== "pending") {
      errors.push(`pending pick ${pick.pickKey} has a final result`);
    }
  }

  const generatedAt = Date.parse(payload.run.generatedAt);
  const now = Date.now();
  if (!Number.isFinite(generatedAt)) {
    errors.push("run generatedAt is invalid");
  } else {
    if (generatedAt > now + 10 * 60 * 1000) {
      errors.push("run generatedAt is too far in the future");
    }
    if (generatedAt < now - 48 * 60 * 60 * 1000) {
      errors.push("run is too old to publish");
    }
  }

  return errors;
}
