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
      title="Clock, queue, player board"
      description="Track the live clock, manage your queue, and draft from the full player board on any screen size."
    >
      <DraftRoomClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
