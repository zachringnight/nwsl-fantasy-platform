import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const probability = z.number().finite().min(0).max(1);
const coverageSchema = z.object({
  coveredMatches: z.number().int().min(0),
  referenceMatches: z.number().int().min(0),
  missingMatchIds: z.array(z.string().min(1).max(128)).max(500),
});

export const generalPredictionRowSchema = z.object({
  matchId: z.string().min(1).max(128),
  matchDate: dateOnly,
  matchStatus: z.literal("upcoming"),
  homeTeam: z.string().min(1).max(160),
  awayTeam: z.string().min(1).max(160),
  homeProbability: probability,
  drawProbability: probability,
  awayProbability: probability,
  lambdaHome: z.number().finite().positive().max(10),
  lambdaAway: z.number().finite().positive().max(10),
  bttsYesProbability: probability,
  overUnder: z.record(
    z.string().regex(/^\d+(?:\.\d+)?$/),
    z.object({ over: probability, under: probability })
  ),
  asianHandicap: z.record(
    z.string(),
    z.object({ home: probability, away: probability })
  ),
});

export const generalPredictionPublishPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  run: z.object({
    runKey: z.string().regex(/^nwsl-general:[A-Za-z0-9._:+-]+$/).max(320),
    modelVersion: z.string().min(1).max(160),
    modelFamily: z.literal("spi_lite_baseline"),
    trainingCutoff: dateOnly,
    sourceManifestGeneratedAt: z.string().datetime({ offset: true }),
    generatedAt: z.string().datetime({ offset: true }),
    gatingStatus: z.enum(["current", "degraded_context"]),
    featureStatus: z.enum(["complete", "partial"]),
    rowCount: z.number().int().min(1).max(500),
    firstPredictionDate: dateOnly,
    lastPredictionDate: dateOnly,
    quality: z.object({
      completedAppearanceCoverage: coverageSchema,
      projectedLineupCoverage: coverageSchema,
    }),
  }),
  predictions: z.array(generalPredictionRowSchema).min(1).max(500),
});

export type GeneralPredictionPublishPayload = z.infer<
  typeof generalPredictionPublishPayloadSchema
>;

export function validateGeneralPredictionPublishInvariants(
  payload: GeneralPredictionPublishPayload
): string[] {
  const errors: string[] = [];
  const generatedAt = Date.parse(payload.run.generatedAt);
  const generatedDate = Number.isFinite(generatedAt)
    ? new Date(generatedAt).toISOString().slice(0, 10)
    : "";
  const ids = new Set<string>();
  const dates: string[] = [];

  if (payload.run.runKey !== `nwsl-general:${payload.run.modelVersion}`) {
    errors.push("run key does not match the model version");
  }
  if (payload.predictions.length !== payload.run.rowCount) {
    errors.push("run row count does not match the predictions");
  }

  for (const row of payload.predictions) {
    if (ids.has(row.matchId)) {
      errors.push(`duplicate prediction row ${row.matchId}`);
    }
    ids.add(row.matchId);
    dates.push(row.matchDate);

    if (!generatedDate || row.matchDate < generatedDate) {
      errors.push(`prediction ${row.matchId} is not an eligible future fixture`);
    }
    if (row.homeTeam === row.awayTeam) {
      errors.push(`prediction ${row.matchId} has identical teams`);
    }

    const resultTotal =
      row.homeProbability + row.drawProbability + row.awayProbability;
    if (Math.abs(resultTotal - 1) > 0.001) {
      errors.push(`prediction ${row.matchId} 1x2 probabilities do not sum to one`);
    }
    for (const [line, probabilities] of Object.entries(row.overUnder)) {
      if (Math.abs(probabilities.over + probabilities.under - 1) > 0.001) {
        errors.push(
          `prediction ${row.matchId} total ${line} probabilities do not sum to one`
        );
      }
    }
  }

  const sortedDates = dates.sort();
  if (
    sortedDates[0] !== payload.run.firstPredictionDate ||
    sortedDates.at(-1) !== payload.run.lastPredictionDate
  ) {
    errors.push("run prediction date range does not match the rows");
  }

  const appearanceCoverage = payload.run.quality.completedAppearanceCoverage;
  const projectedCoverage = payload.run.quality.projectedLineupCoverage;
  const complete =
    appearanceCoverage.missingMatchIds.length === 0 &&
    projectedCoverage.missingMatchIds.length === 0 &&
    appearanceCoverage.coveredMatches === appearanceCoverage.referenceMatches &&
    projectedCoverage.coveredMatches === projectedCoverage.referenceMatches;
  if (
    (payload.run.featureStatus === "complete") !== complete ||
    (payload.run.gatingStatus === "current") !== complete
  ) {
    errors.push("run feature and gating status do not match quality coverage");
  }

  const now = Date.now();
  if (!Number.isFinite(generatedAt)) {
    errors.push("run generatedAt is invalid");
  } else if (
    generatedAt > now + 10 * 60 * 1000 ||
    generatedAt < now - 48 * 60 * 60 * 1000
  ) {
    errors.push("run generatedAt is outside the publication window");
  }

  return errors;
}
