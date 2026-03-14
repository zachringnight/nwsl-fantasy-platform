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
      description="League rules, invite code, and settings for this league."
      highlights={["Rules at a glance", "Invite control", "Commissioner flow"]}
    >
      <LeagueSettingsClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
