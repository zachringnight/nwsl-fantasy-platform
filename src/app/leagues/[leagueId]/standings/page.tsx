import { LeagueStandingsClient } from "@/components/league/league-standings-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueStandingsPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Standings"
      title="Regular season table and playoff race"
      description="Track the table, playoff line, and the scoring totals behind every team record."
    >
      <LeagueStandingsClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
