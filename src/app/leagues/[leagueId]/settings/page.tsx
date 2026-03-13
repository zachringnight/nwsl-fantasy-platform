import { LeagueSettingsClient } from "@/components/league/league-settings-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueSettingsPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Commissioner tools"
      title="League settings and guardrails"
      description="Review league rules, invite details, and the settings that stay fixed once the season is underway."
    >
      <LeagueSettingsClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
