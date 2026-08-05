import { MatchCenterClient } from "@/components/analytics/match-center-client";
import { getMatchResultsBySeason } from "@/lib/analytics/analytics-real-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
import type { Season } from "@/lib/analytics/analytics-real-data";

export const metadata = {
  title: "Match Center",
  description: "NWSL schedule, results, and match analytics.",
};

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const query = await searchParams;
  const season: Season = query.season === "2025" ? "2025" : "2026";
  const live = season === "2026" ? await getLiveNwslPublicData() : null;

  return (
    <MatchCenterClient
      matches={live?.matches ?? getMatchResultsBySeason(season)}
      season={season}
      source={live?.provenance.source ?? "ESPN"}
    />
  );
}
