import { LeagueChatClient } from "@/components/league/league-chat-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueChatPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Chat"
      title="League chat room"
      description="Talk trash, celebrate wins, and stay connected with your league mates."
      highlights={["Trash talk", "Live updates", "League vibes"]}
    >
      <LeagueChatClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
