import { DraftRecapClient } from "@/components/draft/draft-recap-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function DraftRecapPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Draft recap"
      title="See how the draft played out"
      description="See every pick, review your roster, and start building your lineup."
      highlights={["All picks", "Your roster", "Next steps"]}
    >
      <DraftRecapClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
