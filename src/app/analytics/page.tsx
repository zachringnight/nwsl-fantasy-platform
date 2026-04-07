import type { Metadata } from "next";
import { AnalyticsHub } from "@/components/analytics/analytics-hub";
import { getAnalyticsHubData } from "@/lib/analytics/hub";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Public NWSL analytics hub powered by FBref, official NWSL data, nwslR archive tables, and StatsBomb Open Data.",
};

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const resolvedSearchParams = await searchParams;
  const seasonParam = resolvedSearchParams.season;
  const seasonValue = Array.isArray(seasonParam) ? seasonParam[0] : seasonParam;
  const requestedSeason = seasonValue ? Number(seasonValue) : undefined;
  const data = await getAnalyticsHubData(
    Number.isFinite(requestedSeason) ? requestedSeason : undefined
  );

  return <AnalyticsHub data={data} />;
}
