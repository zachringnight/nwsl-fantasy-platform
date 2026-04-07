import type { Metadata } from "next";
import { MatchupPreviewHub } from "@/components/matchup/matchup-preview";
import { getPredictiveHubData } from "@/lib/analytics/predictive";

export const metadata: Metadata = {
  title: "Matchups",
  description:
    "Preview the next NWSL slate with win probabilities, fair prices, projected totals, clean-sheet odds, and top fantasy targets.",
};

export default async function MatchupsPage() {
  const data = await getPredictiveHubData();

  return (
    <MatchupPreviewHub
      matchupBoard={data.predictive.matchupBoard}
      matchups={data.predictive.matchups}
    />
  );
}
