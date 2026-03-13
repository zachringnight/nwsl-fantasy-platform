import { LeaguePageShell } from "@/components/league/league-page-shell";
import { LeagueMatchupClient } from "@/components/matchup/league-matchup-client";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueMatchupPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Matchup"
      title="Pregame, live scoring, and final context"
      description="Follow score swings and key moments as they happen."
    >
      <LeagueMatchupClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
