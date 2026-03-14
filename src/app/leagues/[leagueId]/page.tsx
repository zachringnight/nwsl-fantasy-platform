import { LeaguePageShell } from "@/components/league/league-page-shell";
import { LeagueHomeClient } from "@/components/league/league-home-client";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueHomePage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="League home"
      title="League overview"
      description="Your club story, crew status, and next move in one scroll."
      highlights={["Club story", "Crew status", "Next tap"]}
    >
      <LeagueHomeClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
