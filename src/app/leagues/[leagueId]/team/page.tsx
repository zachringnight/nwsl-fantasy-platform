import { TeamClient } from "@/components/lineup/team-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueTeamPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="My team"
      title="Team and lineup tools"
      description="Set your lineup, review your roster, and make moves."
    >
      <TeamClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
