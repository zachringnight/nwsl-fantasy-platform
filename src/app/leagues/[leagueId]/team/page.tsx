import dynamic from "next/dynamic";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { AsyncRouteProps } from "@/types/routes";

const TeamClient = dynamic(
  () => import("@/components/lineup/team-client").then((m) => m.TeamClient),
  { loading: () => <div className="grid gap-5 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div> }
);

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
      highlights={["Lineup glow", "Bench pressure", "Fast swaps"]}
    >
      <TeamClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
