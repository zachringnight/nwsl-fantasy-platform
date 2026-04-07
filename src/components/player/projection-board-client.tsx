"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { ArrowUpRight, Scale, Search, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { ProjectionPlayerCard } from "@/components/player/projection-player-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { getButtonClassName } from "@/components/ui/button";
import { usePersistedList } from "@/hooks/use-persisted-list";
import type {
  MatchupPreviewRecord,
  PlayerProjectionRecord,
  PredictiveSlateBoardRecord,
} from "@/lib/analytics/predictive";
import type { PlayerPosition } from "@/types/fantasy";

type BoardLens =
  | "SLATE"
  | "VALUE"
  | "CEILING"
  | "FLOOR"
  | "STARTERS"
  | "SHOOTERS"
  | "CREATORS"
  | "DEFENSE"
  | "WATCHLIST"
  | "QUESTIONABLE";

const boardLenses: Array<{ key: BoardLens; label: string }> = [
  { key: "SLATE", label: "Best plays" },
  { key: "VALUE", label: "Value" },
  { key: "CEILING", label: "Ceiling" },
  { key: "FLOOR", label: "Floor" },
  { key: "STARTERS", label: "Starters" },
  { key: "SHOOTERS", label: "Shots" },
  { key: "CREATORS", label: "Creation" },
  { key: "DEFENSE", label: "Defense" },
  { key: "WATCHLIST", label: "Watchlist" },
  { key: "QUESTIONABLE", label: "Lineup risk" },
] as const;

const positionFilters: Array<{ key: "ALL" | PlayerPosition; label: string }> = [
  { key: "ALL", label: "All positions" },
  { key: "GK", label: "Goalkeepers" },
  { key: "DEF", label: "Defenders" },
  { key: "MID", label: "Midfielders" },
  { key: "FWD", label: "Forwards" },
] as const;

interface PlayerProjectionBoardClientProps {
  bestCeilings: PlayerProjectionRecord[];
  bestValues: PlayerProjectionRecord[];
  matchupBoard: PredictiveSlateBoardRecord[];
  matchups: MatchupPreviewRecord[];
  playerBoard: PlayerProjectionRecord[];
  propTargets: PlayerProjectionRecord[];
  safestFloors: PlayerProjectionRecord[];
}

function formatMatchupValue(matchup: MatchupPreviewRecord) {
  return `${matchup.homeTeam} vs ${matchup.awayTeam}`;
}

function quickPicks(
  label: string,
  rows: PlayerProjectionRecord[],
  formatter: (player: PlayerProjectionRecord) => string
) {
  return {
    label,
    rows: rows.slice(0, 3).map((player) => ({
      id: player.id,
      player: player.player,
      team: player.team,
      value: formatter(player),
    })),
  };
}

export function PlayerProjectionBoardClient({
  bestCeilings,
  bestValues,
  matchupBoard,
  matchups,
  playerBoard,
  propTargets,
  safestFloors,
}: PlayerProjectionBoardClientProps) {
  const [search, setSearch] = useState("");
  const [boardLens, setBoardLens] = useState<BoardLens>("SLATE");
  const [positionFilter, setPositionFilter] = useState<"ALL" | PlayerPosition>("ALL");
  const deferredSearch = useDeferredValue(search);
  const watchlist = usePersistedList({ key: "watchlist-v1" });
  const compare = usePersistedList({ key: "compare-v1", maxItems: 2 });

  const watchlistIds = watchlist.items;
  const compareIds = compare.items;

  const filteredPlayers = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const players = playerBoard
      .filter((player) => {
        if (positionFilter !== "ALL" && player.position !== positionFilter) {
          return false;
        }

        if (query) {
          const haystack = [
            player.player,
            player.team,
            player.position,
            player.opponent ?? "",
            player.matchupTag,
            player.riskLabel,
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(query)) {
            return false;
          }
        }

        if (boardLens === "WATCHLIST") {
          return watchlistIds.includes(player.id);
        }

        if (boardLens === "QUESTIONABLE") {
          return player.availability !== "available" || player.starterProbability < 0.58;
        }

        return true;
      })
      .sort((left, right) => {
        switch (boardLens) {
          case "VALUE":
            return right.valueScore - left.valueScore;
          case "CEILING":
            return right.ceiling - left.ceiling;
          case "FLOOR":
            return right.floor - left.floor;
          case "STARTERS":
            return (
              right.starterProbability - left.starterProbability ||
              right.expectedMinutes - left.expectedMinutes ||
              right.projection - left.projection
            );
          case "SHOOTERS":
            return right.shotVolume - left.shotVolume;
          case "CREATORS":
            return right.creationVolume - left.creationVolume;
          case "DEFENSE":
            return (
              right.defensiveVolume +
              (right.cleanSheetChance ?? 0) * 5 -
              (left.defensiveVolume + (left.cleanSheetChance ?? 0) * 5)
            );
          case "WATCHLIST":
          case "QUESTIONABLE":
          case "SLATE":
          default:
            return right.projection - left.projection;
        }
      });

    return players;
  }, [boardLens, deferredSearch, playerBoard, positionFilter, watchlistIds]);

  const comparePlayers = compareIds
    .map((playerId) => playerBoard.find((player) => player.id === playerId) ?? null)
    .filter((player): player is PlayerProjectionRecord => player != null);
  const compareHref =
    comparePlayers.length === 2
      ? `/players/compare?left=${comparePlayers[0].id}&right=${comparePlayers[1].id}`
      : "/players/compare";
  const topValue = bestValues[0];
  const topCeiling = bestCeilings[0];
  const safestFloor = safestFloors[0];
  const propFavorite = propTargets[0];
  const quickPickGroups = [
    quickPicks("Best value", bestValues, (player) => `${player.valueScore.toFixed(2)} value`),
    quickPicks("Ceiling", bestCeilings, (player) => `${player.ceiling.toFixed(1)} ceiling`),
    quickPicks("Floor", safestFloors, (player) => `${player.floor.toFixed(1)} floor`),
    quickPicks(
      "Starter locks",
      [...playerBoard].sort((left, right) => right.starterProbability - left.starterProbability),
      (player) => `${Math.round(player.starterProbability * 100)}% start`
    ),
    quickPicks("Props", propTargets, (player) => `${player.shotVolume.toFixed(1)} shot volume`),
  ];

  return (
    <AppShell
      eyebrow="Players"
      title="Matchup-aware NWSL player board"
      description="Search the slate by projection, floor, ceiling, and role stability so your fantasy builds and prop reads start from the right players."
      actions={
        comparePlayers.length === 2 ? (
          <Link href={compareHref} className={getButtonClassName({ className: "group" })}>
            Compare selected
            <Scale className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <Link
            href="/matchups"
            className={getButtonClassName({
              variant: "secondary",
            })}
          >
            Open matchups
            <ArrowUpRight className="size-4" />
          </Link>
        )
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SurfaceCard
          eyebrow="Slate setup"
          title="Start with the spots that actually move outcomes"
          description="The board below is sorted for the next slate, not season-long trivia. Use it to decide who carries the best mix of role, matchup, and scoring environment."
          tone="brand"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {matchupBoard.map((item) => (
              <div key={item.label} className="rounded-[1.35rem] border border-white/12 bg-black/18 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-white/72">{item.detail}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Board edges"
          title="Quick answers before lock"
          description="If you only need one pass, start here."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile
              detail="Best points per salary."
              label="Value"
              value={topValue ? topValue.player : "N/A"}
            />
            <MetricTile
              detail="Highest one-match upside."
              label="Ceiling"
              tone="brand"
              value={topCeiling ? topCeiling.player : "N/A"}
            />
            <MetricTile
              detail="Safest projection range."
              label="Floor"
              tone="accent"
              value={safestFloor ? safestFloor.player : "N/A"}
            />
            <MetricTile
              detail="Best shot + creation combo."
              label="Props"
              value={propFavorite ? propFavorite.player : "N/A"}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {matchups.slice(0, 4).map((matchup) => (
              <Pill key={matchup.matchKey} tone="default">
                {formatMatchupValue(matchup)}
              </Pill>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <SurfaceCard
          eyebrow="Player board"
          title="Search and sort the slate"
          description="Use matchup-aware projections instead of season-long averages."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile detail="Names you're tracking." label="Watchlist" value={watchlistIds.length} />
              <MetricTile detail="Select two for side-by-side compare." label="Compare" tone="brand" value={compareIds.length} />
              <MetricTile detail="Players on this slate." label="In pool" tone="accent" value={playerBoard.length} />
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand-strong" />
                <input
                  className="field-control pl-11"
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    startTransition(() => {
                      setSearch(nextValue);
                    });
                  }}
                  placeholder="Search player, team, position, or matchup tag"
                  type="search"
                  value={search}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {positionFilters.map((filter) => (
                  <button
                    key={filter.key}
                    className={[
                      "rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55",
                      positionFilter === filter.key
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-panel-soft text-muted hover:border-brand-strong/35 hover:text-foreground",
                    ].join(" ")}
                    onClick={() => {
                      startTransition(() => {
                        setPositionFilter(filter.key);
                      });
                    }}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {boardLenses.map((lens) => (
                <button
                  key={lens.key}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55",
                    boardLens === lens.key
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-panel-soft text-muted hover:border-brand-strong/35 hover:text-foreground",
                  ].join(" ")}
                  onClick={() => {
                    startTransition(() => {
                      setBoardLens(lens.key);
                    });
                  }}
                  type="button"
                >
                  {lens.label}
                </button>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Quick picks"
          title="Shortlists for the main decision lenses"
          description="A fast way to move from projections to actual player names."
          tone="accent"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {quickPickGroups.map((group) => (
              <div key={group.label} className="rounded-[1.4rem] border border-white/12 bg-black/18 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                  {group.label}
                </p>
                <div className="mt-3 space-y-3">
                  {group.rows.map((row) => (
                    <div key={row.id} className="rounded-[1rem] border border-white/10 bg-white/6 px-3 py-3">
                      <p className="text-sm font-semibold text-white">{row.player}</p>
                      <p className="mt-1 text-xs text-white/68">
                        {row.team} • {row.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>

      {filteredPlayers.length === 0 ? (
        <EmptyState
          title="No players match those filters"
          description="Broaden the search or reset the board lens to see the full slate again."
        />
      ) : (
        <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {filteredPlayers.map((player) => (
            <ProjectionPlayerCard
              key={player.id}
              compareDisabled={compareIds.length >= 2}
              isCompared={compareIds.includes(player.id)}
              isWatchlisted={watchlistIds.includes(player.id)}
              onToggleCompare={() => {
                compare.toggle(player.id);
              }}
              onToggleWatchlist={() => {
                watchlist.toggle(player.id);
              }}
              player={player}
            />
          ))}
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <SurfaceCard
          eyebrow="Why this board"
          title="Built for projections, props, and slate decisions"
          description="Each card blends the historical fantasy baseline with current-season role, team environment, clean-sheet equity, and the matchup-specific total."
        >
          <div className="space-y-3 text-sm text-muted">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand-strong" />
              Projection, floor, and ceiling all move with the matchup.
            </div>
            <div className="flex items-center gap-2">
              <Target className="size-4 text-brand-strong" />
              Search by value, shot volume, creation, or defensive floor.
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand-strong" />
              Starter probability and role notes flag the safest lineup spots.
            </div>
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-brand-strong" />
              Watchlist and compare stay available for actual lineup decisions.
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Next step"
          title="Open the matchup board"
          description="Use the companion matchup page to pressure-test the game environment, fair prices, and top targets behind every projection."
        >
          <Link href="/matchups" className={getButtonClassName()}>
            Open matchup board
            <ArrowUpRight className="size-4" />
          </Link>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
