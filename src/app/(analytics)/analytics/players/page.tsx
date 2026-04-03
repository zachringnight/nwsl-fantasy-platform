"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import { getPlayerRankings } from "@/lib/analytics/analytics-data";
import type { PlayerPosition } from "@/types/fantasy";
import type { PlayerSortKey } from "@/types/analytics";

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
  { key: "xg", label: "xG" },
  { key: "pointsPer90", label: "Pts/90" },
  { key: "minutes", label: "Minutes" },
];

export default function PlayerRankingsPage() {
  const allPlayers = useMemo(() => getPlayerRankings(), []);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [sortBy, setSortBy] = useState<PlayerSortKey>("fantasyPoints");

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allPlayers
      .filter((p) => {
        if (posFilter !== "ALL" && p.position !== posFilter) return false;
        if (query && !p.name.toLowerCase().includes(query) && !p.team.toLowerCase().includes(query)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));
  }, [allPlayers, search, posFilter, sortBy]);

  return (
    <AppShell
      eyebrow="Player Analytics"
      title="Rankings"
      description="Every player in the NWSL ranked by performance, goals, assists, xG, and fantasy points."
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search players or teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full border border-line bg-white/6 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder-muted outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand-strong/20"
          />
        </div>

        {/* Position filter */}
        <div className="flex gap-1">
          {positions.map((pos) => (
            <button
              key={pos.key}
              type="button"
              onClick={() => setPosFilter(pos.key)}
              className={
                posFilter === pos.key
                  ? "rounded-full bg-brand/20 px-3 py-2 text-xs font-semibold text-brand-strong"
                  : "rounded-full px-3 py-2 text-xs font-semibold text-muted hover:bg-white/6 hover:text-foreground"
              }
            >
              {pos.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as PlayerSortKey)}
          className="rounded-full border border-line bg-white/6 px-4 py-2.5 text-sm text-foreground outline-none focus:border-brand/40"
        >
          {sortOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted">{filteredPlayers.length} players</p>

      {/* Table */}
      <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white/4">
        <table className="w-full min-w-[800px] text-sm">
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
              <th className="px-4 py-3 text-right">xA</th>
              <th className="px-4 py-3 text-right">FP</th>
              <th className="px-4 py-3 text-right">FP/90</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map((player, i) => (
              <tr
                key={player.playerId}
                className="border-b border-line/50 transition hover:bg-white/4"
              >
                <td className="px-4 py-3 font-mono text-muted">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/analytics/players/${player.playerId}`}
                    className="font-medium text-foreground hover:text-brand-strong"
                  >
                    {player.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{player.team}</td>
                <td className="px-4 py-3">
                  <Pill tone="default">{player.position}</Pill>
                </td>
                <td className="px-4 py-3 text-right font-mono">{player.appearances}</td>
                <td className="px-4 py-3 text-right font-mono">{player.minutes}</td>
                <td className="px-4 py-3 text-right font-mono">{player.goals}</td>
                <td className="px-4 py-3 text-right font-mono">{player.assists}</td>
                <td className="px-4 py-3 text-right font-mono">{player.xg.toFixed(1)}</td>
                <td className="px-4 py-3 text-right font-mono">{player.xa.toFixed(1)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-brand-strong">
                  {player.fantasyPoints}
                </td>
                <td className="px-4 py-3 text-right font-mono">{player.pointsPer90}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
