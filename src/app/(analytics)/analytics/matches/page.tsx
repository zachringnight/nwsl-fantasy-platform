import { MatchCenterClient } from "@/components/analytics/match-center-client";
import { getMatchResultsBySeason } from "@/lib/analytics/analytics-real-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
import { getLiveModelBoard } from "@/lib/analytics/live-model-board";
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
  const [live, liveModelBoard] =
    season === "2026"
      ? await Promise.all([getLiveNwslPublicData(), getLiveModelBoard()])
      : [null, null];

  return (
    <MatchCenterClient
      matches={live?.matches ?? getMatchResultsBySeason(season)}
      season={season}
      source={live?.provenance.source ?? "ESPN"}
      matchOdds={
        liveModelBoard?.odds.map((odds) => ({
          matchId: odds.matchId,
          sportsbook: odds.sportsbook,
          marketType: odds.marketType,
          line: odds.line,
          homeOdds: odds.homeOdds,
          drawOdds: odds.drawOdds,
          awayOdds: odds.awayOdds,
          overOdds: odds.overOdds,
          underOdds: odds.underOdds,
        })) ?? []
      }
    />
  );
}
