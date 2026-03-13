import { LeaguePlayersClient } from "@/components/player/league-players-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeaguePlayersPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="League players"
      title="Search, filter, and compare"
      description="Browse available players, check who's taken, and find your next move."
    >
      <LeaguePlayersClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
