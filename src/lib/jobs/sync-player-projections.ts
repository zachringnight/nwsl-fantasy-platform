import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { getMaterializedFantasyProjectionSlate } from "@/lib/projections/materialize";
import { prisma } from "@/lib/prisma";

const OFFICIAL_PROVIDER_KEY = "NWSL_DATA" as const;

function getDistinctStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function deriveValueRating(projectedPoints: number, salaryCost: number | null | undefined) {
  if (salaryCost && salaryCost > 0) {
    const pointsPerDollar = projectedPoints / salaryCost;
    if (pointsPerDollar >= 1.2) return "elite_value";
    if (pointsPerDollar >= 0.95) return "good_value";
    if (pointsPerDollar >= 0.7) return "fair";
    return "overpriced";
  }

  if (projectedPoints >= 12) return "elite_value";
  if (projectedPoints >= 8) return "good_value";
  if (projectedPoints >= 4) return "fair";
  return "overpriced";
}

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "sync-player-projections";
  const slate = await getMaterializedFantasyProjectionSlate(
    "site_launch_v1",
    "salary_cap_season_long"
  );

  if (slate.players.length === 0 || slate.matches.length === 0) {
    return {
      jobId,
      status: "skipped",
      summary: "No materialized slate projections were available to persist.",
    };
  }

  const provider = await prisma.provider.findUnique({
    where: { key: OFFICIAL_PROVIDER_KEY },
    select: { id: true },
  });

  if (!provider) {
    return {
      jobId,
      status: "skipped",
      summary:
        "The official NWSL provider is not configured, so canonical player projections were not persisted.",
    };
  }

  const officialFixtureIds = getDistinctStrings(
    slate.matches.map((match) => match.matchKey)
  );
  const officialPlayerIds = getDistinctStrings(
    slate.players.map((player) => player.official_player_id)
  );

  if (officialFixtureIds.length === 0 || officialPlayerIds.length === 0) {
    return {
      jobId,
      status: "skipped",
      summary:
        "The canonical projection slate did not include official fixture and player ids to persist.",
    };
  }

  const [fixtureMaps, playerMaps] = await Promise.all([
    prisma.providerFixtureMap.findMany({
      where: {
        providerId: provider.id,
        providerFixtureId: { in: officialFixtureIds },
      },
      select: {
        providerFixtureId: true,
        fixtureId: true,
      },
    }),
    prisma.providerPlayerMap.findMany({
      where: {
        providerId: provider.id,
        providerPlayerId: { in: officialPlayerIds },
      },
      select: {
        providerPlayerId: true,
        playerId: true,
      },
    }),
  ]);

  const fixtureIdByOfficialId = new Map(
    fixtureMaps.map((fixtureMap) => [fixtureMap.providerFixtureId, fixtureMap.fixtureId])
  );
  const playerIdByOfficialId = new Map(
    playerMaps.map((playerMap) => [playerMap.providerPlayerId, playerMap.playerId])
  );

  let upserted = 0;
  let skippedPlayers = 0;

  for (const projection of slate.players) {
    const officialFixtureId = projection.match_key ?? projection.fixture_id;
    const fixtureId = officialFixtureId
      ? fixtureIdByOfficialId.get(officialFixtureId) ?? null
      : null;
    const playerId = playerIdByOfficialId.get(projection.official_player_id) ?? null;

    if (!fixtureId || !playerId) {
      skippedPlayers += 1;
      continue;
    }

    const projectedPoints = projection.projected_points ?? projection.average_points;
    const confidence = projection.projection_confidence ?? 0.6;
    const floorPoints =
      projection.floor_points ?? Math.max(0, projectedPoints * 0.72);
    const ceilingPoints =
      projection.ceiling_points ?? projectedPoints * 1.28;
    const valueRating = deriveValueRating(projectedPoints, projection.salary_cost);

    await prisma.playerProjection.upsert({
      where: {
        playerId_fixtureId: {
          playerId,
          fixtureId,
        },
      },
      create: {
        playerId,
        fixtureId,
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
    upserted += 1;
  }

  return {
    jobId,
    status: upserted > 0 ? "success" : "skipped",
    summary: `Upserted ${upserted} player projections from the canonical slate materialization. Skipped ${skippedPlayers} rows that could not be matched to a fixture/player. Started at ${context.startedAt}.`,
  };
}

export const syncPlayerProjectionsJob: JobDefinition = {
  id: "sync-player-projections",
  description:
    "Persist canonical player fantasy projections from the shared projection service",
  frequency: "daily",
  run,
};
