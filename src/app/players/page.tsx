"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Heart, Search, Scale, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { PlayerCard } from "@/components/player/player-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { usePersistedList } from "@/hooks/use-persisted-list";
import { getButtonClassName } from "@/components/ui/button";
import { getFantasyPlayerPool } from "@/lib/fantasy-player-pool";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type { FantasyPoolPlayer } from "@/types/fantasy";

type BoardFilter = "ALL" | "WATCHLIST" | "TRENDING" | "QUESTIONABLE" | "VALUE";

const boardFilters: Array<{ key: BoardFilter; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "WATCHLIST", label: "Watchlist" },
  { key: "TRENDING", label: "Trending" },
  { key: "QUESTIONABLE", label: "Questionable" },
  { key: "VALUE", label: "Best value" },
];

export default function PlayersPage() {
  const players = useMemo(() => getFantasyPlayerPool(), []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("ALL");
  const watchlist = usePersistedList({ key: "watchlist-v1" });
  const compare = usePersistedList({ key: "compare-v1", maxItems: 2 });

  const watchlistIds = watchlist.items;
  const compareIds = compare.items;

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const nextPlayers = players
      .filter((player) => {
        if (query) {
          const matchesQuery =
            player.display_name.toLowerCase().includes(query) ||
            player.club_name.toLowerCase().includes(query) ||
            player.position.toLowerCase().includes(query);

          if (!matchesQuery) {
            return false;
          }
        }

        if (filter === "WATCHLIST") {
          return watchlistIds.includes(player.id);
        }

        if (filter === "TRENDING") {
          return player.average_points >= 14;
        }

        if (filter === "QUESTIONABLE") {
          return player.availability !== "available";
        }

        return true;
      })
      .sort((left, right) => {
        if (filter === "VALUE") {
          return getValueScore(right) - getValueScore(left);
        }

        if (filter === "TRENDING") {
          return right.average_points - left.average_points;
        }

        return left.rank - right.rank;
      });

    return nextPlayers;
  }, [filter, players, search, watchlistIds]);

  const comparePlayers = compareIds
    .map((playerId) => players.find((player) => player.id === playerId) ?? null)
    .filter((player): player is FantasyPoolPlayer => player != null);
  const compareHref =
    comparePlayers.length === 2
      ? `/players/compare?left=${comparePlayers[0].id}&right=${comparePlayers[1].id}`
      : "/players/compare";
  const watchlistPlayers = players.filter((player) => watchlistIds.includes(player.id));
  const topValuePlayer = [...players].sort((left, right) => getValueScore(right) - getValueScore(left))[0];

  function toggleWatchlist(playerId: string) {
    watchlist.toggle(playerId);
  }

  function toggleCompare(playerId: string) {
    compare.toggle(playerId);
  }

  return (
    <AppShell
      eyebrow="Players"
      title="Scout with real conviction before the room tilts"
      description="Scout, watchlist, and compare before you commit a pick or salary slot."
      actions={
        comparePlayers.length === 2 ? (
          <Link href={compareHref} className={getButtonClassName({ className: "group" })}>
            Compare selected
            <Scale className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <span
            className={getButtonClassName({
              className: "cursor-default justify-center opacity-55",
              variant: "secondary",
            })}
          >
            Select 2 to compare
          </span>
        )
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <SurfaceCard
          eyebrow="Scouting control"
          title="Watchlist, compare, and project from one board"
          description="Search, filter, and pin targets from one board."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                detail="Persistent browser watchlist for your strongest targets."
                label="Watchlist"
                value={watchlistIds.length}
              />
              <MetricTile
                detail="Two-player compare tray for actual decisions, not just browsing."
                label="Compare tray"
                tone="brand"
                value={compareIds.length}
              />
              <MetricTile
                detail="Best value using projected points per $1k of salary."
                label="Top value"
                tone="accent"
                value={topValuePlayer ? topValuePlayer.display_name.split(" ")[0] : "N/A"}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand-strong" />
                <input
                  className="field-control pl-11"
                  onChange={(event) => {
                    setSearch(event.target.value);
                  }}
                  placeholder="Search player, club, or position"
                  type="search"
                  value={search}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {boardFilters.map((boardFilter) => (
                  <button
                    key={boardFilter.key}
                    className={[
                      "rounded-full border px-4 py-2 text-sm font-medium transition",
                      filter === boardFilter.key
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-panel-soft text-muted hover:border-brand-strong/35 hover:text-foreground",
                    ].join(" ")}
                    onClick={() => {
                      setFilter(boardFilter.key);
                    }}
                    type="button"
                  >
                    {boardFilter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Scoring clarity"
          title="Projection readout and rules are visible before you commit"
          description="Projections reflect real NWSL performance. Value score ranks projected points per $1k of salary."
          tone="accent"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill tone="brand">
                <Target className="size-3.5" />
                Projection = avg points
              </Pill>
              <Pill tone="success">
                <Sparkles className="size-3.5" />
                Value = points per $1k
              </Pill>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Core scoring
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Goals: {launchScoringRules.goal.FWD}-{launchScoringRules.goal.DEF}, assists: {launchScoringRules.assist}, shots: {launchScoringRules.shot}, on target: {launchScoringRules.shotOnTarget}, chances created: {launchScoringRules.chanceCreated}.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Floor and risk
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Passes: {launchScoringRules.successfulPass}, crosses: {launchScoringRules.successfulCross}, tackles won: {launchScoringRules.tackleWon}, interceptions: {launchScoringRules.interception}, yellow/red: {launchScoringRules.yellowCard}/{launchScoringRules.redCard}.
                </p>
              </div>
            </div>
            <Link
              href="/rules"
              className={getButtonClassName({
                className: "justify-center",
                variant: "secondary",
              })}
            >
              Open full scoring rules
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <SurfaceCard
          eyebrow="Compare tray"
          title={comparePlayers.length > 0 ? "Two-player decision lane" : "Select players to compare"}
          description="Pin two players here, then open the compare view when you are down to a real decision."
        >
          {comparePlayers.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {comparePlayers.map((player) => (
                  <div
                    key={player.id}
                    className="rounded-[1.3rem] border border-line bg-white/6 p-4"
                  >
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                      {player.position} • {player.club_name}
                    </p>
                    <p className="mt-3 text-xl font-semibold leading-tight text-foreground">
                      {player.display_name}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {player.average_points.toFixed(1)} proj • ${player.salary_cost} • value {getValueScore(player).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {comparePlayers.length === 2 ? (
                  <Link href={compareHref} className={getButtonClassName()}>
                    Open head-to-head compare
                  </Link>
                ) : (
                  <span
                    className={getButtonClassName({
                      className: "cursor-default opacity-55",
                      variant: "secondary",
                    })}
                  >
                    Add one more player
                  </span>
                )}
                <button
                  className={getButtonClassName({
                    variant: "ghost",
                  })}
                  onClick={() => {
                    compare.clear();
                  }}
                  type="button"
                >
                  Clear compare tray
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-muted">
              Tap compare on any player card to start a real head-to-head decision.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Watchlist"
          title={watchlistPlayers.length > 0 ? "Pinned manager targets" : "No watchlist targets yet"}
          description="Keep your best targets close before draft day, waiver runs, or salary-cap lock."
          tone="accent"
        >
          {watchlistPlayers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {watchlistPlayers.slice(0, 8).map((player) => (
                <button
                  key={player.id}
                  className="rounded-full border border-line bg-white/8 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand-strong/35 hover:text-brand-strong"
                  onClick={() => {
                    setSearch(player.display_name);
                    setFilter("WATCHLIST");
                  }}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Heart className="size-3.5 text-accent" />
                    {player.display_name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-white/72">
              Tap watchlist on a player card to pin her here and keep your scouting board tighter.
            </p>
          )}
        </SurfaceCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {filteredPlayers.map((player) => (
          <PlayerCard
            key={player.id}
            compareDisabled={compareIds.length >= 2}
            detailHref={`/players/${player.id}`}
            isCompared={compareIds.includes(player.id)}
            isWatchlisted={watchlistIds.includes(player.id)}
            onToggleCompare={() => {
              toggleCompare(player.id);
            }}
            onToggleWatchlist={() => {
              toggleWatchlist(player.id);
            }}
            player={player}
          />
        ))}
      </section>
    </AppShell>
  );
}

function getValueScore(player: FantasyPoolPlayer) {
  if (player.salary_cost <= 0) {
    return player.average_points;
  }

  return (player.average_points / player.salary_cost) * 1000;
}
