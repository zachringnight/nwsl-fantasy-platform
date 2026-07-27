import { z } from "zod";

const finiteNullable = z.number().finite().nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const officialMatchId = z
  .string()
  .regex(/^nwsl::Football_Match::[0-9a-f]{32}$/);
const jsonObject = z.record(z.string(), z.unknown());

export const modelSlateRowSchema = z.object({
  policyId: z.literal("nwsl-totals-open-over-v1"),
  officialMatchId,
  matchId: z.string().min(1).max(128),
  matchDate: dateOnly,
  homeTeam: z.string().min(1).max(160),
  awayTeam: z.string().min(1).max(160),
  market: z.literal("total_over"),
  side: z.literal("over"),
  sportsbook: z.literal("DraftKings").nullable(),
  quoteTimestamp: z.string().datetime({ offset: true }).nullable(),
  firstSeenTimestamp: z.string().datetime({ offset: true }).nullable(),
  line: z.literal(2.5).nullable(),
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
  officialMatchId,
  matchId: z.string().min(1).max(128),
  matchDate: dateOnly,
  homeTeam: z.string().min(1).max(160),
  awayTeam: z.string().min(1).max(160),
  market: z.literal("total_over"),
  side: z.literal("over"),
  sportsbook: z.literal("DraftKings"),
  quoteTimestamp: z.string().datetime({ offset: true }),
  firstSeenTimestamp: z.string().datetime({ offset: true }).nullable(),
  line: z.literal(2.5),
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

export const modelOddsSnapshotSchema = z.object({
  officialMatchId,
  matchId: z.string().min(1).max(128),
  matchDate: dateOnly,
  homeTeam: z.string().min(1).max(160),
  awayTeam: z.string().min(1).max(160),
  sportsbook: z.string().min(1).max(120),
  quoteTimestamp: z.string().datetime({ offset: true }),
  marketType: z.enum(["1x2", "total"]),
  line: finiteNullable,
  homeOdds: finiteNullable,
  drawOdds: finiteNullable,
  awayOdds: finiteNullable,
  overOdds: finiteNullable,
  underOdds: finiteNullable,
  sourceType: z.enum(["current", "live"]),
  quoteAgeMinutes: z.number().finite().min(0).max(180),
  isFresh: z.literal(true),
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
  odds: z.array(modelOddsSnapshotSchema).max(2_000),
});

export type ModelPublishPayload = z.infer<typeof modelPublishPayloadSchema>;

export function validateModelPublishInvariants(payload: ModelPublishPayload): string[] {
  const errors: string[] = [];
  const generatedAt = Date.parse(payload.run.generatedAt);
  const actionableRows = payload.slate.filter((row) => row.actionable);
  const pricedRows = payload.slate.filter(
    (row) =>
      row.line !== null &&
      row.overOdds !== null &&
      row.underOdds !== null &&
      row.sportsbook !== null &&
      row.quoteTimestamp !== null
  );

  if (actionableRows.length !== payload.run.actionablePicks) {
    errors.push("run actionable count does not match the slate");
  }
  if (payload.slate.length !== payload.run.matchesInWindow) {
    errors.push("run match count does not match the slate");
  }
  if (pricedRows.length !== payload.run.pricedMatches) {
    errors.push("run priced count does not match the slate");
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

    const lockedSlateRow = actionableRows.find(
      (row) => row.matchId === pick.matchId
    );
    if (
      lockedSlateRow &&
      (lockedSlateRow.officialMatchId !== pick.officialMatchId ||
        lockedSlateRow.sportsbook !== pick.sportsbook ||
        lockedSlateRow.quoteTimestamp !== pick.quoteTimestamp ||
        lockedSlateRow.line !== pick.line ||
        lockedSlateRow.overOdds !== pick.overOdds)
    ) {
      errors.push(`locked pick ${pick.pickKey} does not match its slate quote`);
    }
  }

  const slateMatchIds = new Set(payload.slate.map((row) => row.matchId));
  const uniqueOdds = new Set<string>();
  for (const odds of payload.odds) {
    if (!slateMatchIds.has(odds.matchId)) {
      errors.push(`odds row ${odds.matchId} is outside the published slate`);
    }

    const oddsKey = [
      odds.matchId,
      odds.sportsbook,
      odds.marketType,
      odds.line ?? "none",
      odds.quoteTimestamp,
    ].join(":");
    if (uniqueOdds.has(oddsKey)) {
      errors.push(`duplicate odds row ${oddsKey}`);
    }
    uniqueOdds.add(oddsKey);

    const quoteTimestamp = Date.parse(odds.quoteTimestamp);
    const computedAgeMinutes =
      (generatedAt - quoteTimestamp) / (60 * 1_000);
    if (
      !Number.isFinite(generatedAt) ||
      !Number.isFinite(quoteTimestamp) ||
      computedAgeMinutes < -15 ||
      computedAgeMinutes > 180
    ) {
      errors.push(`odds row ${oddsKey} is outside the publish freshness window`);
    } else if (
      Math.abs(
        odds.quoteAgeMinutes - Math.max(computedAgeMinutes, 0)
      ) > 0.05
    ) {
      errors.push(`odds row ${oddsKey} has an invalid supplied quote age`);
    }

    if (odds.marketType === "total") {
      if (
        odds.line === null ||
        odds.overOdds === null ||
        odds.overOdds <= 1 ||
        odds.underOdds === null ||
        odds.underOdds <= 1 ||
        odds.homeOdds !== null ||
        odds.drawOdds !== null ||
        odds.awayOdds !== null
      ) {
        errors.push(`total odds row ${oddsKey} violates the market contract`);
      }
    } else if (
      odds.line !== null ||
      odds.homeOdds === null ||
      odds.homeOdds <= 1 ||
      odds.drawOdds === null ||
      odds.drawOdds <= 1 ||
      odds.awayOdds === null ||
      odds.awayOdds <= 1 ||
      odds.overOdds !== null ||
      odds.underOdds !== null
    ) {
      errors.push(`1x2 odds row ${oddsKey} violates the market contract`);
    }
  }

  for (const row of pricedRows) {
    const exactQuote = payload.odds.find(
      (odds) =>
        odds.matchId === row.matchId &&
        odds.officialMatchId === row.officialMatchId &&
        odds.marketType === "total" &&
        odds.sportsbook === row.sportsbook &&
        odds.quoteTimestamp === row.quoteTimestamp &&
        odds.line === row.line &&
        odds.overOdds === row.overOdds &&
        odds.underOdds === row.underOdds
    );
    if (!exactQuote) {
      errors.push(`priced slate row ${row.matchId} has no exact odds snapshot`);
    } else if (
      row.quoteAgeMinutes === null ||
      Math.abs(row.quoteAgeMinutes - exactQuote.quoteAgeMinutes) > 0.05
    ) {
      errors.push(`priced slate row ${row.matchId} has an invalid quote age`);
    }
  }

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
