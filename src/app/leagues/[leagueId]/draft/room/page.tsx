import dynamic from "next/dynamic";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { AsyncRouteProps } from "@/types/routes";

const DraftRoomClient = dynamic(
  () => import("@/components/draft/draft-room-client").then((m) => m.DraftRoomClient),
  { loading: () => <DraftRoomSkeleton /> }
);

function DraftRoomSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

export default async function LeagueDraftRoomPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Live draft room"
      title="Clock, queue, player board"
      description="Draft from the full player board while the clock runs."
      highlights={["Clock pressure", "Queue energy", "Board control"]}
    >
      <DraftRoomClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
