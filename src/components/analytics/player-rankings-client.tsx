"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import {
  analyticsPlayerHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";
import type {
  AnalyticsProvenance,
  PlayerSeasonStats,
  PlayerSortKey,
} from "@/types/analytics";
import type { PlayerPosition } from "@/types/fantasy";

type PositionFilter = "ALL" | PlayerPosition;

const positions: Array<{ key: PositionFilter; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "GK", label: "GK" },
  { key: "DEF", label: "DEF" },
  { key: "MID", label: "MID" },
  { key: "FWD", label: "FWD" },
];

const sortOptions: Array<{ key: PlayerSortKey; label: string }> = [
  { key: "fantasyPoints", label: "Fantasy Pts" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "xg", label: "Expected Goals" },
  { key: "pointsPer90", label: "Pts/90" },
  { key: "minutes", label: "Minutes" },
  { key: "appearances", label: "Appearances" },
];

function formatAsOf(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "snapshot";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(parsed));
}

function incompleteFantasyCoverageLabel(player: PlayerSeasonStats): string | null {
  if (player.matchStatsComplete !== false) return null;
  const coveredAppearances = Math.max(
    0,
    Math.round(player.matchStatsAppearances ?? 0)
  );
  return `Partial tracked fantasy total: match-by-match detail is available for ${coveredAppearances} of ${player.appearances} appearances; official season totals remain available.`;
}

export function PlayerRankingsClient({
  players,
  provenance,
  season,
}: {
  players: PlayerSeasonStats[];
  provenance: AnalyticsProvenance;
  season: "2025" | "2026";
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [sortBy, setSortBy] = useState<PlayerSortKey>("fantasyPoints");

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return players
      .filter((player) => {
        if (posFilter !== "ALL" && player.position !== posFilter) return false;
        if (
          query &&
          !player.name.toLowerCase().includes(query) &&
          !player.team.toLowerCase().includes(query)
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          Number(right[sortBy] ?? 0) - Number(left[sortBy] ?? 0)
      );
  }, [players, search, posFilter, sortBy]);

  return (
    <AppShell
      eyebrow="Player Analytics"
      title="Rankings"
      description={
        players.length > 0
          ? `All ${players.length} players in the ${season} NWSL data set, ranked by performance and fantasy scoring. ${provenance.source}, updated ${formatAsOf(provenance.generatedAt)}.`
          : `Player-level analytics are not available for the ${season} archive. Team standings and match results remain available.`
      }
    >
      {provenance.isStale && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          The latest official snapshot is older than 36 hours. The last complete
          data set remains visible while the next refresh retries.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search players or teams..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-full border border-line bg-white/6 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder-muted outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand-strong/20"
          />
        </div>

        <div className="flex gap-1">
          {positions.map((position) => (
            <button
              key={position.key}
              type="button"
              onClick={() => setPosFilter(position.key)}
              className={
                posFilter === position.key
                  ? "rounded-full bg-brand/20 px-3 py-2 text-xs font-semibold text-brand-strong"
                  : "rounded-full px-3 py-2 text-xs font-semibold text-muted hover:bg-white/6 hover:text-foreground"
              }
            >
              {position.label}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as PlayerSortKey)}
          className="rounded-full border border-line bg-white/6 px-4 py-2.5 text-sm text-foreground outline-none focus:border-brand/40"
        >
          {sortOptions.map((option) => (
            <option key={option.key} value={option.key}>
              Sort: {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted">{filteredPlayers.length} players</p>

      <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white/4">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3 text-right">App</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3 text-right">G</th>
              <th className="px-4 py-3 text-right">A</th>
              <th className="px-4 py-3 text-right">xG</th>
              <th className="px-4 py-3 text-right">Shots</th>
              <th className="px-4 py-3 text-right">Tkl</th>
              <th className="px-4 py-3 text-right">FP</th>
              <th className="px-4 py-3 text-right">FP/90</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map((player, index) => {
              const coverageLabel = incompleteFantasyCoverageLabel(player);
              return (
                <tr
                  key={player.playerId}
                  className="border-b border-line/50 transition hover:bg-white/4"
                >
                  <td className="px-4 py-3 font-mono text-muted">{index + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={analyticsPlayerHref(player.playerId, season)}
                      className="font-medium text-foreground hover:text-brand-strong"
                    >
                      {player.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {player.teamId ? (
                      <Link
                        href={analyticsTeamHref(player.teamId, season)}
                        className="text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        {player.team}
                      </Link>
                    ) : (
                      <span className="text-muted">{player.team}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone="default">{player.position}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.appearances}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.minutes}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.goals}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.assists}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.xg > 0 ? player.xg.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.shots}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.tackles}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-brand-strong">
                    <span className="inline-flex items-baseline justify-end gap-1.5">
                      {player.fantasyPoints}
                      {coverageLabel ? (
                        <span
                          title={coverageLabel}
                          aria-label={coverageLabel}
                          className="font-sans text-[0.6rem] font-semibold uppercase tracking-wide text-warning"
                        >
                          Partial
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {player.pointsPer90}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {players.length === 0 && (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">
            No verified player-level records are available for {season}.
          </p>
        </div>
      )}
    </AppShell>
  );
}
