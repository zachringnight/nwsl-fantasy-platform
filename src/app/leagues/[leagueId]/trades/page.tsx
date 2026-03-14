import { LeagueTradesClient } from "@/components/league/league-trades-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueTradesPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Trades"
      title="Trade proposals and review"
      description="Propose trades, review incoming offers, and vote on league deals."
      highlights={["Propose trades", "Veto system", "Trade history"]}
    >
      <LeagueTradesClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
