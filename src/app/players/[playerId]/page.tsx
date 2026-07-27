import Link from "next/link";
import { SurfaceCard } from "@/components/common/surface-card";
import { AppShell } from "@/components/common/app-shell";
import { PlayerSpotlightCard } from "@/components/player/player-spotlight-card";
import { getFantasyPlayerById } from "@/lib/fantasy-player-pool";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
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
  const live = await getLiveNwslPublicData();
  const livePlayer = live?.players.find((candidate) => candidate.playerId === playerId);
  const playerName =
    livePlayer?.name ?? player?.display_name ?? formatTitleFromSlug(playerId);
  const position = livePlayer?.position ?? player?.position;
  const clubName = livePlayer?.team ?? player?.club_name;
  const teamId =
    livePlayer?.teamId ?? (clubName ? analyticsTeamId(clubName) : "");
  const appearances =
    livePlayer?.appearances ?? player?.appearances_2025 ?? 0;
  const starts = livePlayer?.starts ?? player?.starts_2025 ?? 0;
  const minutes = livePlayer?.minutes ?? player?.minutes_2025 ?? 0;
  const goals = livePlayer?.goals ?? player?.goals_2025 ?? 0;
  const assists = livePlayer?.assists ?? player?.assists_2025 ?? 0;
  const cleanSheets =
    livePlayer?.cleanSheets ?? player?.clean_sheets_2025 ?? 0;
  const saves = livePlayer?.saves ?? player?.saves_2025 ?? 0;
  const yellowCards =
    livePlayer?.yellowCards ?? player?.yellow_cards_2025 ?? 0;
  const redCards = livePlayer?.redCards ?? player?.red_cards_2025 ?? 0;
  const rank = livePlayer && live
    ? live.players.findIndex((candidate) => candidate.playerId === playerId) + 1
    : player?.rank ?? 0;
  const attackLabel = position === "GK" ? "Saves" : "Goals";
  const attackValue =
    position === "GK" ? String(saves) : String(goals);
  const supportLabel = position === "GK" ? "Clean sheets" : "Assists";
  const supportValue =
    position === "GK" ? String(cleanSheets) : String(assists);
  const statsSeason = livePlayer
    ? "2026 NWSL regular season"
    : player?.stats_source_season ?? "2026 NWSL regular season";
  const hasPlayer = Boolean(player || livePlayer);

  return (
    <AppShell
      eyebrow="Player detail"
      title={playerName}
      description={
        hasPlayer
          ? (
              <>
                {teamId ? (
                  <Link
                    href={analyticsTeamHref(teamId, "2026")}
                    className="hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {clubName}
                  </Link>
                ) : (
                  clubName
                )}{" "}
                • {position} • #{rank} overall
              </>
            )
          : "Player not found."
      }
      actions={
        hasPlayer ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={analyticsPlayerHref(playerId, "2026")}
              className="rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand-strong/50"
            >
              Performance analytics
            </Link>
            {teamId && (
              <Link
                href={analyticsTeamHref(teamId, "2026")}
                className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
              >
                {clubName}
              </Link>
            )}
          </div>
        ) : null
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        {hasPlayer ? (
          <PlayerSpotlightCard
            appearances={appearances}
            availability={player?.availability ?? "available"}
            averagePoints={
              livePlayer && appearances > 0
                ? Number((livePlayer.fantasyPoints / appearances).toFixed(1))
                : player?.average_points ?? 0
            }
            clubName={clubName ?? "NWSL"}
            photoUrl={player?.photo_url}
            playerName={playerName}
            position={position ?? "FWD"}
            primaryStatLabel={attackLabel}
            primaryStatValue={Number(attackValue)}
            rank={rank}
            salaryCost={player?.salary_cost ?? 6}
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
          title={hasPlayer ? `${statsSeason} performance` : "Search another player"}
          description={
            hasPlayer
              ? "Fantasy values and season totals use the latest complete official NWSL snapshot."
              : "Try searching the player board."
          }
          tone="accent"
        >
          {hasPlayer ? (
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <p>
                <Link
                  href={analyticsPlayerHref(playerId, "2026")}
                  className="font-medium hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {playerName}
                </Link>{" "}
                represents{" "}
                {teamId ? (
                  <Link
                    href={analyticsTeamHref(teamId, "2026")}
                    className="font-medium hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {clubName}
                  </Link>
                ) : (
                  clubName
                )}{" "}
                in the current fantasy player pool.
              </p>
              <p>
                {position === "GK"
                  ? `${saves} saves and ${cleanSheets} clean sheets in ${appearances} appearances.`
                  : `${goals} goals and ${assists} assists in ${appearances} appearances.`}
              </p>
              <p>
                Starts: {starts} • Minutes: {minutes} • Yellow cards: {yellowCards} • Red cards: {redCards}
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
