import { DraftLobbyClient } from "@/components/draft/draft-lobby-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function DraftLobbyPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Draft lobby"
      title="Pre-draft waiting room"
      description="Draft order, start time, and setup — all before the room opens."
    >
      <DraftLobbyClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
