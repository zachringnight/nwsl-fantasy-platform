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
      title="See how the room broke"
      description="See every pick, review your roster, and start building your lineup."
      highlights={["Pick story", "Roster shape", "Next steps"]}
    >
      <DraftRecapClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
