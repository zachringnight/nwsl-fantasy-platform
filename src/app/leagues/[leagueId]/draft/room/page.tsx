import { DraftRoomClient } from "@/components/draft/draft-room-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueDraftRoomPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Live draft room"
      title="Draft room and player board"
      description="Draft from the full player board while the clock runs."
      highlights={["Draft clock", "Queue", "Player board"]}
    >
      <DraftRoomClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
