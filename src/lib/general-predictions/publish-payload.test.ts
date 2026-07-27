import { describe, expect, it } from "vitest";
import {
  generalPredictionPublishPayloadSchema,
  validateGeneralPredictionPublishInvariants,
  type GeneralPredictionPublishPayload,
} from "./publish-payload";

function payload(): GeneralPredictionPublishPayload {
  const generatedAt = new Date().toISOString();
  const generatedDate = generatedAt.slice(0, 10);
  const futureDate = new Date(Date.parse(`${generatedDate}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    schemaVersion: 1,
    run: {
      runKey: "nwsl-general:20260727T180000Z",
      modelVersion: "20260727T180000Z",
      modelFamily: "spi_lite_baseline",
      trainingCutoff: "2026-07-27",
      sourceManifestGeneratedAt: generatedAt,
      generatedAt,
      gatingStatus: "current",
      featureStatus: "complete",
      rowCount: 1,
      firstPredictionDate: futureDate,
      lastPredictionDate: futureDate,
      quality: {
        completedAppearanceCoverage: {
          coveredMatches: 127,
          referenceMatches: 127,
          missingMatchIds: [],
        },
        projectedLineupCoverage: {
          coveredMatches: 1,
          referenceMatches: 1,
          missingMatchIds: [],
        },
      },
    },
    predictions: [
      {
        matchId: "401854070",
        matchDate: futureDate,
        matchStatus: "upcoming",
        homeTeam: "Orlando Pride",
        awayTeam: "Kansas City Current",
        homeProbability: 0.45,
        drawProbability: 0.28,
        awayProbability: 0.27,
        lambdaHome: 1.6,
        lambdaAway: 1.1,
        bttsYesProbability: 0.51,
        overUnder: {
          "2.5": { over: 0.52, under: 0.48 },
        },
        asianHandicap: {},
      },
    ],
  };
}

describe("general prediction publish payload", () => {
  it("accepts one traceable upcoming projection snapshot", () => {
    const parsed = generalPredictionPublishPayloadSchema.parse(payload());

    expect(validateGeneralPredictionPublishInvariants(parsed)).toEqual([]);
  });

  it("rejects duplicate or non-upcoming prediction rows", () => {
    const input = payload();
    input.predictions.push({
      ...input.predictions[0],
      matchStatus: "completed" as "upcoming",
    });
    input.run.rowCount = 2;

    const parsed = generalPredictionPublishPayloadSchema.safeParse(input);

    expect(parsed.success).toBe(false);
  });

  it("rejects a prediction date before the artifact was generated", () => {
    const input = payload();
    input.predictions[0].matchDate = "2026-07-26";
    input.run.firstPredictionDate = "2026-07-26";
    input.run.lastPredictionDate = "2026-07-26";

    expect(validateGeneralPredictionPublishInvariants(input)).toContain(
      "prediction 401854070 is not an eligible future fixture"
    );
  });
});
