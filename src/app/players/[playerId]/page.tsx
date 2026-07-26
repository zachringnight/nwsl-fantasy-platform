import Link from "next/link";
import { SurfaceCard } from "@/components/common/surface-card";
import { AppShell } from "@/components/common/app-shell";
import { PlayerSpotlightCard } from "@/components/player/player-spotlight-card";
import { getFantasyPlayerById } from "@/lib/fantasy-player-pool";
import { formatTitleFromSlug } from "@/lib/utils";
import {
  analyticsPlayerHref,
  analyticsTeamHref,
  analyticsTeamId,
} from "@/lib/analytics/entity-routes";
import type { FantasyPoolPlayer } from "@/types/fantasy";
import type { AsyncRouteProps } from "@/types/routes";

interface PlayerDetailRecord extends FantasyPoolPlayer {
  appearances_2025?: number;
  starts_2025?: number;
  minutes_2025?: number;
  goals_2025?: number;
  assists_2025?: number;
  clean_sheets_2025?: number;
  saves_2025?: number;
  goals_conceded_2025?: number;
  yellow_cards_2025?: number;
  red_cards_2025?: number;
  stats_source_season?: string;
}

export default async function PlayerDetailPage({
  params,
}: AsyncRouteProps<{ playerId: string }>) {
  const { playerId } = await params;
  const player = getFantasyPlayerById(playerId) as PlayerDetailRecord | null;
  const playerName = player?.display_name ?? formatTitleFromSlug(playerId);
  const attackLabel = player?.position === "GK" ? "Saves" : "Goals";
  const attackValue =
    player?.position === "GK"
      ? String(player?.saves_2025 ?? 0)
      : String(player?.goals_2025 ?? 0);
  const supportLabel = player?.position === "GK" ? "Clean sheets" : "Assists";
  const supportValue =
    player?.position === "GK"
      ? String(player?.clean_sheets_2025 ?? 0)
      : String(player?.assists_2025 ?? 0);
  const statsSeason = player?.stats_source_season ?? "2025 NWSL regular season";

  return (
    <AppShell
      eyebrow="Player detail"
      title={playerName}
      description={
        player
          ? (
              <>
                <Link
                  href={analyticsTeamHref(analyticsTeamId(player.club_name))}
                  className="hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {player.club_name}
                </Link>{" "}
                • {player.position} • #{player.rank} overall
              </>
            )
          : "Player not found."
      }
      actions={
        player ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={analyticsPlayerHref(player.id)}
              className="rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand-strong/50"
            >
              Performance analytics
            </Link>
            <Link
              href={analyticsTeamHref(analyticsTeamId(player.club_name))}
              className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
            >
              {player.club_name}
            </Link>
          </div>
        ) : null
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        {player ? (
          <PlayerSpotlightCard
            appearances={player.appearances_2025 ?? 0}
            availability={player.availability}
            averagePoints={player.average_points}
            clubName={player.club_name}
            photoUrl={player.photo_url}
            playerName={player.display_name}
            position={player.position}
            primaryStatLabel={attackLabel}
            primaryStatValue={Number(attackValue)}
            rank={player.rank}
            salaryCost={player.salary_cost}
            statsSeason={statsSeason}
          />
        ) : (
          <SurfaceCard
            eyebrow="Stats"
            title="Player not found"
            description="This player isn't on the current board."
          />
        )}
        <SurfaceCard
          eyebrow="Season summary"
          title={player ? `${statsSeason} performance` : "Search another player"}
          description={
            player
              ? "Projections based on real NWSL stats."
              : "Try searching the player board."
          }
          tone="accent"
        >
          {player ? (
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <p>
                <Link
                  href={analyticsPlayerHref(player.id)}
                  className="font-medium hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {player.display_name}
                </Link>{" "}
                represents{" "}
                <Link
                  href={analyticsTeamHref(analyticsTeamId(player.club_name))}
                  className="font-medium hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {player.club_name}
                </Link>{" "}
                in the current fantasy player pool.
              </p>
              <p>
                {player.position === "GK"
                  ? `${player.saves_2025 ?? 0} saves and ${player.clean_sheets_2025 ?? 0} clean sheets in ${player.appearances_2025 ?? 0} appearances.`
                  : `${player.goals_2025 ?? 0} goals and ${player.assists_2025 ?? 0} assists in ${player.appearances_2025 ?? 0} appearances.`}
              </p>
              <p>
                Starts: {player.starts_2025 ?? 0} • Minutes: {player.minutes_2025 ?? 0} • Yellow cards: {player.yellow_cards_2025 ?? 0} • Red cards: {player.red_cards_2025 ?? 0}
              </p>
              <p>
                {supportLabel}: {supportValue} • Source: {statsSeason}
              </p>
            </div>
          ) : null}
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
