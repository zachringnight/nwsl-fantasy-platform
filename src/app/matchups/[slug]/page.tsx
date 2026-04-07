import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchupPreviewDetail } from "@/components/matchup/matchup-preview";
import { getPredictiveHubData } from "@/lib/analytics/predictive";
import type { AsyncRouteProps } from "@/types/routes";

export async function generateMetadata({
  params,
}: AsyncRouteProps<{ slug: string }>): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPredictiveHubData();
  const matchup = data.predictive.matchups.find((entry) => entry.slug === slug);

  if (!matchup) {
    return {
      title: "Matchup preview",
      description: "NWSL matchup preview",
    };
  }

  return {
    title: `${matchup.homeTeam} vs ${matchup.awayTeam}`,
    description: matchup.summary,
  };
}

export default async function MatchupDetailPage({
  params,
}: AsyncRouteProps<{ slug: string }>) {
  const { slug } = await params;
  const data = await getPredictiveHubData();
  const matchup = data.predictive.matchups.find((entry) => entry.slug === slug);

  if (!matchup) {
    notFound();
  }

  return <MatchupPreviewDetail matchup={matchup} />;
}
