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
      description="Track score swings, event momentum, and the current state of the contest from one place."
    >
      <LeagueMatchupClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
