import type { Metadata } from "next";
import { PlayerProjectionBoardClient } from "@/components/player/projection-board-client";
import { getPredictiveHubData } from "@/lib/analytics/predictive";

export const metadata: Metadata = {
  title: "Player Board",
  description:
    "Search matchup-aware NWSL player projections with floor, ceiling, value, and role confidence for fantasy builds and prop research.",
};

export default async function PlayersPage() {
  const data = await getPredictiveHubData();

  return (
    <PlayerProjectionBoardClient
      bestCeilings={data.predictive.bestCeilings}
      bestValues={data.predictive.bestValues}
      matchupBoard={data.predictive.matchupBoard}
      matchups={data.predictive.matchups}
      playerBoard={data.predictive.playerBoard}
      propTargets={data.predictive.propTargets}
      safestFloors={data.predictive.safestFloors}
    />
  );
}
