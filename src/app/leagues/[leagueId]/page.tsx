import type { Metadata } from "next";
import { LeaguePageShell } from "@/components/league/league-page-shell";
import { LeagueHomeClient } from "@/components/league/league-home-client";
import type { AsyncRouteProps } from "@/types/routes";

export async function generateMetadata({
  params,
}: AsyncRouteProps<{ leagueId: string }>): Promise<Metadata> {
  const { leagueId } = await params;
  return {
    title: `League ${leagueId}`,
    description: "League overview, crew status, and next moves.",
  };
}

export default async function LeagueHomePage({
  params,
}: AsyncRouteProps<{ leagueId: string }>) {
  const { leagueId } = await params;

  return (
    <LeaguePageShell
      leagueId={leagueId}
      eyebrow="League home"
      title="League overview"
      description="Your club story, crew status, and next move in one scroll."
      highlights={["Club story", "Crew status", "Next tap"]}
    >
      <LeagueHomeClient leagueId={leagueId} />
    </LeaguePageShell>
  );
}
