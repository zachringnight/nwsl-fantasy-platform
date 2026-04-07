import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";

const POSITION_MULTIPLIERS: Record<string, number> = {
  FWD: 2.0,
  MID: 1.5,
  DEF: 0.8,
  GK: 0.5,
};

function deriveValueRating(projectedPoints: number): string {
  // Without salary data, use projected points thresholds
  if (projectedPoints >= 12) return "elite_value";
  if (projectedPoints >= 8) return "good_value";
  if (projectedPoints >= 4) return "fair";
  return "overpriced";
}

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "sync-player-projections";

  const predictions = await prisma.modelPrediction.findMany({
    where: {
      fixture: {
        startsAt: { gte: new Date() },
        status: "SCHEDULED",
      },
    },
    include: {
      fixture: {
        include: {
          homeClub: true,
          awayClub: true,
        },
      },
    },
  });

  if (predictions.length === 0) {
    return {
      jobId,
      status: "skipped",
      summary: "No upcoming predictions to derive player projections from.",
    };
  }

  let upserted = 0;

  for (const prediction of predictions) {
    const fixture = prediction.fixture;

    // Get players from both clubs
    const players = await prisma.player.findMany({
      where: {
        currentClubId: { in: [fixture.homeClubId, fixture.awayClubId] },
        status: "ACTIVE",
      },
    });

    for (const player of players) {
      const isHome = player.currentClubId === fixture.homeClubId;
      const teamLambda = isHome
        ? prediction.lambdaHome
        : prediction.lambdaAway;

      const posMultiplier =
        POSITION_MULTIPLIERS[player.primaryPosition] ?? 1.0;

      // Base projected points from team xG scaled by position
      const projectedPoints = teamLambda * posMultiplier * 3;

      // Floor and ceiling based on confidence interval
      const confidence = 0.65;
      const floorPoints = Math.max(0, projectedPoints * 0.5);
      const ceilingPoints = projectedPoints * 1.8;

      const valueRating = deriveValueRating(projectedPoints);

      await prisma.playerProjection.upsert({
        where: {
          playerId_fixtureId: {
            playerId: player.id,
            fixtureId: fixture.id,
          },
        },
        create: {
          playerId: player.id,
          fixtureId: fixture.id,
          projectedPoints,
          confidence,
          floorPoints,
          ceilingPoints,
          valueRating,
        },
        update: {
          projectedPoints,
          confidence,
          floorPoints,
          ceilingPoints,
          valueRating,
          generatedAt: new Date(),
        },
      });
      upserted++;
    }
  }

  return {
    jobId,
    status: "success",
    summary: `Upserted ${upserted} player projections across ${predictions.length} fixtures. Started at ${context.startedAt}.`,
  };
}

export const syncPlayerProjectionsJob: JobDefinition = {
  id: "sync-player-projections",
  description:
    "Derive per-player fantasy point projections from model predictions",
  frequency: "daily",
  run,
};
