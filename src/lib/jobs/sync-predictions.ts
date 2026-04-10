import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import type { Prisma } from "@/generated/prisma/client";
import {
  getPredictionApiJsonHeaders,
  getPredictionApiUrl,
  PERSISTED_PREDICTION_MODEL,
  REQUESTED_PREDICTION_MODEL,
  type PredictionApiBatchResponse,
  type PredictionApiPrediction,
} from "@/lib/prediction-api";
import { prisma } from "@/lib/prisma";

function isBatchPredictResponse(
  payload: unknown
): payload is PredictionApiBatchResponse {
  return (
    !!payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { predictions?: unknown }).predictions)
  );
}

function buildPredictionMetadata(
  prediction: PredictionApiPrediction
): Prisma.InputJsonObject {
  return JSON.parse(
    JSON.stringify({
      ...(prediction.metadata ?? {}),
      requested_model: REQUESTED_PREDICTION_MODEL,
      model_family: prediction.model_family,
      model_version: prediction.model_version,
      blended: prediction.blended,
      gating_status: prediction.gating_status,
      projected_home_goals: prediction.projected_home_goals,
      projected_away_goals: prediction.projected_away_goals,
      projection_quality: prediction.projection_quality,
      fair_odds: prediction.fair_odds,
      totals: prediction.totals,
      btts_yes_prob: prediction.btts_yes_prob,
      btts_yes_fair_odds: prediction.btts_yes_fair_odds,
    })
  ) as Prisma.InputJsonObject;
}

function getTotalsMarket(prediction: PredictionApiPrediction, line: number) {
  return prediction.totals.find((market) => market.line === line) ?? null;
}

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "sync-predictions";
  const apiUrl = getPredictionApiUrl("/batch-predict");

  if (!apiUrl) {
    return {
      jobId,
      status: "skipped",
      summary: "PREDICTION_API_URL not configured",
    };
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      startsAt: { gte: new Date() },
      status: "SCHEDULED",
    },
    include: { homeClub: true, awayClub: true },
    take: 30,
  });

  if (fixtures.length === 0) {
    return {
      jobId,
      status: "skipped",
      summary: "No upcoming fixtures to generate predictions for.",
    };
  }

  const batchPayload = {
    matches: fixtures.map((f) => ({
      home_team: f.homeClub.name,
      away_team: f.awayClub.name,
      match_date: f.startsAt.toISOString().slice(0, 10),
      model: REQUESTED_PREDICTION_MODEL,
    })),
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: getPredictionApiJsonHeaders(),
    body: JSON.stringify(batchPayload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Model API returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }

  const payload = await response.json().catch(() => null);
  if (!isBatchPredictResponse(payload)) {
    throw new Error("Model API returned an invalid batch prediction payload");
  }
  if (payload.predictions.length !== fixtures.length) {
    throw new Error(
      `Model API returned ${payload.predictions.length} predictions for ${fixtures.length} fixtures`
    );
  }

  let saved = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const pred = payload.predictions[i];

    const predictionRow = await prisma.modelPrediction.upsert({
      where: {
        fixtureId_modelName: {
          fixtureId: fixture.id,
          modelName: PERSISTED_PREDICTION_MODEL,
        },
      },
      create: {
        fixtureId: fixture.id,
        modelName: PERSISTED_PREDICTION_MODEL,
        homeWinProb: pred.home_win_prob,
        drawProb: pred.draw_prob,
        awayWinProb: pred.away_win_prob,
        lambdaHome: pred.lambda_home,
        lambdaAway: pred.lambda_away,
        scoreMatrix: pred.score_matrix,
        metadata: buildPredictionMetadata(pred),
      },
      update: {
        homeWinProb: pred.home_win_prob,
        drawProb: pred.draw_prob,
        awayWinProb: pred.away_win_prob,
        lambdaHome: pred.lambda_home,
        lambdaAway: pred.lambda_away,
        scoreMatrix: pred.score_matrix,
        metadata: buildPredictionMetadata(pred),
        generatedAt: new Date(),
      },
    });

    const totals25 = getTotalsMarket(pred, 2.5);
    await prisma.fairOdds.upsert({
      where: {
        predictionId: predictionRow.id,
      },
      create: {
        predictionId: predictionRow.id,
        homeOdds: pred.fair_odds.home.fair_odds,
        drawOdds: pred.fair_odds.draw.fair_odds,
        awayOdds: pred.fair_odds.away.fair_odds,
        bttsYesOdds: pred.btts_yes_fair_odds,
        over25Odds: totals25?.over_fair_odds ?? null,
        under25Odds: totals25?.under_fair_odds ?? null,
      },
      update: {
        homeOdds: pred.fair_odds.home.fair_odds,
        drawOdds: pred.fair_odds.draw.fair_odds,
        awayOdds: pred.fair_odds.away.fair_odds,
        bttsYesOdds: pred.btts_yes_fair_odds,
        over25Odds: totals25?.over_fair_odds ?? null,
        under25Odds: totals25?.under_fair_odds ?? null,
      },
    });
    saved++;
  }

  return {
    jobId,
    status: "success",
    summary: `Synced ${saved} predictions for upcoming fixtures. Started at ${context.startedAt}.`,
  };
}

export const syncPredictionsJob: JobDefinition = {
  id: "sync-predictions",
  description: "Fetch model predictions for upcoming fixtures",
  frequency: "daily",
  run,
};
