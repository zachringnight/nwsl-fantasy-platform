import type { Metadata } from "next";
import { AnalyticsHub } from "@/components/analytics/analytics-hub";
import { getPredictiveHubData } from "@/lib/analytics/predictive";

export const metadata: Metadata = {
  title: "Research Hub",
  description: "Use projections, matchup context, player form, and team trends to build sharper fantasy and betting reads across the NWSL.",
};

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const resolvedSearchParams = await searchParams;
  const seasonParam = resolvedSearchParams.season;
  const seasonValue = Array.isArray(seasonParam) ? seasonParam[0] : seasonParam;
  const requestedSeason = seasonValue ? Number(seasonValue) : undefined;
  const data = await getPredictiveHubData(
    Number.isFinite(requestedSeason) ? requestedSeason : undefined
  );

  return <AnalyticsHub data={data} />;
}
