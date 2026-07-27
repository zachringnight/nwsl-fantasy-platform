import { PlayerRankingsClient } from "@/components/analytics/player-rankings-client";
import { getPlayerRankings } from "@/lib/analytics/analytics-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
import { officialFantasyPlayerPoolSource } from "@/lib/generated/fantasy-player-pool.generated";
import type { AnalyticsProvenance } from "@/types/analytics";

export const metadata = {
  title: "Player Rankings",
  description:
    "NWSL player statistics, fantasy scoring, and performance rankings.",
};

const fallbackProvenance: AnalyticsProvenance = {
  season: "2026",
  source: "Official NWSL snapshot",
  generatedAt: officialFantasyPlayerPoolSource.generatedAt,
  isLive: false,
  isStale: false,
};

const archivedProvenance: AnalyticsProvenance = {
  season: "2025",
  source: "NWSL archive",
  generatedAt: "",
  isLive: false,
  isStale: false,
};

export default async function PlayerRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const query = await searchParams;
  const season = query.season === "2025" ? "2025" : "2026";
  const live = season === "2026" ? await getLiveNwslPublicData() : null;
  const players =
    season === "2026"
      ? live?.players ?? getPlayerRankings()
      : [];

  return (
    <PlayerRankingsClient
      players={players}
      provenance={
        season === "2026"
          ? live?.provenance ?? fallbackProvenance
          : archivedProvenance
      }
      season={season}
    />
  );
}
