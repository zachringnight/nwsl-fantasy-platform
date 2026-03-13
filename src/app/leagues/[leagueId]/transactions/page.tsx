import { TransactionsClient } from "@/components/league/transactions-client";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import type { AsyncRouteProps } from "@/types/routes";

export default async function LeagueTransactionsPage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="Transactions"
      title="Waivers, adds, and drops"
      description="Waiver priority, pending claims, and recent roster moves."
    >
      <TransactionsClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
