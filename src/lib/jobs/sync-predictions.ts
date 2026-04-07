import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "sync-predictions";
  const apiUrl = process.env.PREDICTION_API_URL;
  const apiSecret = process.env.PREDICTION_API_SECRET;

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
    fixtures: fixtures.map((f) => ({
      home_team: f.homeClub.name,
      away_team: f.awayClub.name,
      model_name: "dixon_coles",
    })),
  };

  const response = await fetch(`${apiUrl}/batch-predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiSecret}`,
    },
    body: JSON.stringify(batchPayload),
  });

  if (!response.ok) {
    throw new Error(`Model API returned ${response.status}`);
  }

  const predictions = await response.json();
  let saved = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const pred = predictions[i];

    await prisma.modelPrediction.upsert({
      where: {
        fixtureId_modelName: {
          fixtureId: fixture.id,
          modelName: "dixon_coles",
        },
      },
      create: {
        fixtureId: fixture.id,
        modelName: "dixon_coles",
        homeWinProb: pred.home_win_prob,
        drawProb: pred.draw_prob,
        awayWinProb: pred.away_win_prob,
        lambdaHome: pred.lambda_home,
        lambdaAway: pred.lambda_away,
        scoreMatrix: pred.score_matrix,
        metadata: pred.metadata,
      },
      update: {
        homeWinProb: pred.home_win_prob,
        drawProb: pred.draw_prob,
        awayWinProb: pred.away_win_prob,
        lambdaHome: pred.lambda_home,
        lambdaAway: pred.lambda_away,
        scoreMatrix: pred.score_matrix,
        metadata: pred.metadata,
        generatedAt: new Date(),
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
