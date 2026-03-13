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
  const sourceSeason = player?.stats_source_season ?? "recent NWSL production";
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
          ? `Official 2026 roster profile with a ${sourceSeason.toLowerCase()} baseline for drafts, waivers, and salary-cap builds.`
          : "That player is not on the current NWSL board."
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard
          eyebrow="Projection snapshot"
          title={player ? "What this player brings right now" : "Player not found"}
          description={
            player
              ? `${player.club_name} • ${player.position} • Ranked #${player.rank} on the live board`
              : "That player is not on the current board."
          }
        >
          {player ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                detail="Projected fantasy production"
                label="Average points"
                value={player.average_points.toFixed(1)}
              />
              <MetricTile detail="Salary-cap price" label="Salary" tone="brand" value={`$${player.salary_cost}`} />
              <MetricTile
                detail={`${sourceSeason} workload`}
                label="Appearances"
                value={String(player.appearances_2025 ?? 0)}
              />
              <MetricTile
                detail={`${sourceSeason} production`}
                label={attackLabel}
                tone="accent"
                value={attackValue}
              />
              <MetricTile detail="Supporting category" label={supportLabel} value={supportValue} />
              <MetricTile
                detail="Current availability"
                label="Status"
                value={player.availability}
              />
            </div>
          ) : null}
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Manager read"
          title={player ? "Why the number lands here" : "Search another player"}
          description={
            player
              ? "The projection is built from official NWSL production, then smoothed for sample size so the live board does not overreact to tiny minute counts."
              : "Search the player board for another manager target."
          }
          tone="accent"
        >
          {player ? (
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <p>
                {player.display_name} is on the {player.club_name} roster for 2026. Their board value blends {sourceSeason.toLowerCase()} output into the current fantasy scoring model so managers can compare draft targets and salary plays on one scale.
              </p>
              <p>
                {player.position === "GK"
                  ? `${player.display_name} logged ${player.saves_2025 ?? 0} saves and ${player.clean_sheets_2025 ?? 0} clean sheets in ${player.appearances_2025 ?? 0} appearances, which drives a steadier floor profile.`
                  : `${player.display_name} posted ${player.goals_2025 ?? 0} goals and ${player.assists_2025 ?? 0} assists in ${player.appearances_2025 ?? 0} appearances, which shapes the current projection and upside read.`}
              </p>
              <p>
                Starts: {player.starts_2025 ?? 0} • Minutes: {player.minutes_2025 ?? 0} • Discipline: {player.yellow_cards_2025 ?? 0} yellow, {player.red_cards_2025 ?? 0} red
              </p>
            </div>
          ) : null}
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
