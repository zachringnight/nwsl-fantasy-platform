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
      description="Your next action, invite code, and this week's key info."
    >
      <LeagueHomeClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
