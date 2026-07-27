import "server-only";

import type { MatchPrediction } from "@/types/analytics";
import { getLiveGeneralPredictions } from "@/lib/analytics/live-general-predictions";
import { loadModelPredictions } from "@/lib/analytics/model-data-loader";
import { getRealMatchResults } from "@/lib/analytics/analytics-real-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";

export async function getMatchPredictions(): Promise<MatchPrediction[]> {
  const [live, publicData] = await Promise.all([
    getLiveGeneralPredictions(),
    getLiveNwslPublicData(),
  ]);
  const upcomingMatchIds = new Set(
    (publicData?.matches ?? getRealMatchResults())
      .filter((match) => match.status === "upcoming")
      .map((match) => match.matchId)
  );
  return (live ?? loadModelPredictions()).filter((prediction) =>
    upcomingMatchIds.has(prediction.matchId)
  );
}

export async function getMatchPrediction(
  matchId: string
): Promise<MatchPrediction | undefined> {
  const predictions = await getMatchPredictions();
  return predictions.find((prediction) => prediction.matchId === matchId);
}
