import { SurfaceCard } from "@/components/common/surface-card";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { getFantasyPlayerById } from "@/lib/fantasy-player-pool";
import { formatTitleFromSlug } from "@/lib/utils";
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

  return (
    <AppShell
      eyebrow="Player detail"
      title={playerName}
      description={
        player
          ? `${player.club_name} • ${player.position} • #${player.rank} overall`
          : "Player not found."
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard
          eyebrow="Stats"
          title={player ? player.display_name : "Player not found"}
          description={
            player
              ? `${player.club_name} • ${player.position} • Rank #${player.rank}`
              : "This player isn't on the current board."
          }
        >
          {player ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                detail="Projected points per match"
                label="Average points"
                value={player.average_points.toFixed(1)}
              />
              <MetricTile detail="Salary-cap cost" label="Salary" tone="brand" value={`$${player.salary_cost}`} />
              <MetricTile
                detail="Games played"
                label="Appearances"
                value={String(player.appearances_2025 ?? 0)}
              />
              <MetricTile
                detail="2025 season"
                label={attackLabel}
                tone="accent"
                value={attackValue}
              />
              <MetricTile detail="2025 season" label={supportLabel} value={supportValue} />
              <MetricTile
                detail="Availability"
                label="Status"
                value={player.availability}
              />
            </div>
          ) : null}
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Season summary"
          title={player ? "2025 performance" : "Search another player"}
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
                {player.display_name} plays for {player.club_name} in the 2026 season.
              </p>
              <p>
                {player.position === "GK"
                  ? `${player.saves_2025 ?? 0} saves and ${player.clean_sheets_2025 ?? 0} clean sheets in ${player.appearances_2025 ?? 0} appearances.`
                  : `${player.goals_2025 ?? 0} goals and ${player.assists_2025 ?? 0} assists in ${player.appearances_2025 ?? 0} appearances.`}
              </p>
              <p>
                Starts: {player.starts_2025 ?? 0} • Minutes: {player.minutes_2025 ?? 0} • Yellow cards: {player.yellow_cards_2025 ?? 0} • Red cards: {player.red_cards_2025 ?? 0}
              </p>
            </div>
          ) : null}
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
