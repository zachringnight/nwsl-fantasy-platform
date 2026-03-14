import { LeagueAchievementsClient } from "@/components/league/league-achievements-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueAchievementsPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Badges"
      title="Achievements and streaks"
      description="Unlock badges, build win streaks, and see what your rivals have earned."
      highlights={["Badge wall", "Win streaks", "League feed"]}
    >
      <LeagueAchievementsClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
