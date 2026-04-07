import type { Metadata } from "next";
import Link from "next/link";
import { SurfaceCard } from "@/components/common/surface-card";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { getFantasyPlayerById } from "@/lib/fantasy-player-pool";
import { getPredictiveHubData } from "@/lib/analytics/predictive";
import { formatTitleFromSlug } from "@/lib/utils";
import type { FantasyPoolPlayer } from "@/types/fantasy";
import type { AsyncRouteProps } from "@/types/routes";

export async function generateMetadata({
  params,
}: AsyncRouteProps<{ playerId: string }>): Promise<Metadata> {
  const { playerId } = await params;
  const player = getFantasyPlayerById(playerId);
  const data = await getPredictiveHubData();
  const playerProjection = data.predictive.playerBoard.find((entry) => entry.id === playerId);
  const name = player?.display_name ?? formatTitleFromSlug(playerId);
  return {
    title: name,
    description: playerProjection
      ? `${name} — ${playerProjection.team} ${playerProjection.position}. ${playerProjection.projection.toFixed(1)} projected fantasy points with ${playerProjection.floor.toFixed(1)} floor and ${playerProjection.ceiling.toFixed(1)} ceiling.`
      : player
        ? `${name} — ${player.club_name} ${player.position}. Fantasy projection, salary, and season stats.`
        : `Player profile for ${name}.`,
  };
}

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
  const data = await getPredictiveHubData();
  const player = getFantasyPlayerById(playerId) as PlayerDetailRecord | null;
  const playerProjection = data.predictive.playerBoard.find((entry) => entry.id === playerId) ?? null;
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
        playerProjection
          ? `${playerProjection.team} • ${playerProjection.position} • ${playerProjection.projection.toFixed(1)} projection`
          : player
            ? `${player.club_name} • ${player.position} • #${player.rank} overall`
            : "Player not found."
      }
      actions={
        playerProjection?.opponent ? (
          <Link
            href="/matchups"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:text-brand"
          >
            Open matchup board
          </Link>
        ) : undefined
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard
          eyebrow="Projection"
          title={player ? player.display_name : "Player not found"}
          description={
            playerProjection
              ? `${playerProjection.team} • ${playerProjection.position} • ${playerProjection.matchupTag}`
              : player
                ? `${player.club_name} • ${player.position} • Rank #${player.rank}`
                : "This player isn't on the current board."
          }
        >
          {player ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                detail="Matchup-aware fantasy projection"
                label="Projection"
                value={playerProjection ? playerProjection.projection.toFixed(1) : player.average_points.toFixed(1)}
              />
              <MetricTile
                detail="Salary-cap cost"
                label="Salary"
                tone="brand"
                value={`$${player.salary_cost}`}
              />
              <MetricTile
                detail="Safer outcome if the match stays quiet"
                label="Floor"
                value={playerProjection ? playerProjection.floor.toFixed(1) : player.average_points.toFixed(1)}
              />
              <MetricTile
                detail="Best-case single-match outcome"
                label="Ceiling"
                tone="accent"
                value={playerProjection ? playerProjection.ceiling.toFixed(1) : player.average_points.toFixed(1)}
              />
              <MetricTile
                detail="Expected role before lock"
                label="Minutes"
                value={playerProjection ? playerProjection.expectedMinutes.toFixed(0) : String(player.minutes_2025 ?? 0)}
              />
              <MetricTile
                detail="Model confidence in this projection"
                label="Confidence"
                value={playerProjection ? `${Math.round(playerProjection.confidence * 100)}%` : player.availability}
              />
            </div>
          ) : null}
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Why this spot"
          title={playerProjection ? "Slate context" : "Season summary"}
          description={
            playerProjection
              ? `${playerProjection.opponent ? `vs ${playerProjection.opponent}` : "No current opponent"} • ${playerProjection.riskLabel} • ${playerProjection.trendLabel}`
              : player
                ? "Projections based on real NWSL stats."
                : "Try searching the player board."
          }
          tone="accent"
        >
          {playerProjection ? (
            <div className="space-y-3 text-sm leading-6 text-foreground">
              {playerProjection.reasons.map((reason) => (
                <p key={`${playerProjection.id}-${reason}`}>{reason}</p>
              ))}
              <p>
                Value score: {playerProjection.valueScore.toFixed(2)} •{" "}
                {playerProjection.cleanSheetChance != null
                  ? `${Math.round(playerProjection.cleanSheetChance * 100)}% clean-sheet chance`
                  : `${playerProjection.shotVolume.toFixed(1)} shot volume`}
              </p>
            </div>
          ) : player ? (
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

      <section className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="Historical baseline"
          title={player ? "2025 fantasy source data" : "Search another player"}
          description={
            player
              ? "The projection layer starts from this historical baseline and then moves it with matchup, role, and team environment."
              : "Try searching the player board."
          }
        >
          {player ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                detail="Games played"
                label="Appearances"
                value={String(player.appearances_2025 ?? 0)}
              />
              <MetricTile
                detail="Starts in the 2025 data set"
                label="Starts"
                value={String(player.starts_2025 ?? 0)}
              />
              <MetricTile detail="2025 season" label={attackLabel} value={attackValue} />
              <MetricTile detail="2025 season" label={supportLabel} value={supportValue} />
              <MetricTile
                detail="Cards in the historical sample"
                label="Discipline"
                value={`${player.yellow_cards_2025 ?? 0}Y / ${player.red_cards_2025 ?? 0}R`}
              />
              <MetricTile
                detail="Original raw fantasy average"
                label="Baseline"
                value={player.average_points.toFixed(1)}
              />
            </div>
          ) : null}
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Next step"
          title={playerProjection ? "Use this player in context" : "Open the player board"}
          description={
            playerProjection
              ? "The strongest way to use this page is to compare the player against the rest of the slate and the game environment."
              : "Head back to the matchup-aware board to see where this player stands on the slate."
          }
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <p>
              {playerProjection
                ? `${playerProjection.player} carries a ${playerProjection.matchupTag.toLowerCase()} with ${playerProjection.projection.toFixed(1)} projected points and a ${playerProjection.ceiling.toFixed(1)} point ceiling.`
                : "Use the player board for slate-aware projections, value sorting, and compare workflows."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/players"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                Open player board
              </Link>
              <Link
                href="/matchups"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground"
              >
                Open matchups
              </Link>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
