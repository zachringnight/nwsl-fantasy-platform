"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import { getMatchResults } from "@/lib/analytics/analytics-data";
import { useAnalyticsSeason } from "@/components/analytics/season-selector";

type StatusFilter = "all" | "completed" | "upcoming";
type MatchSort = "date_desc" | "date_asc" | "matchday_desc" | "matchday_asc" | "team_asc";

export default function MatchesPage() {
  const season = useAnalyticsSeason();
  const allMatches = useMemo(() => getMatchResults(), []);
  // Filter by season based on date
  const matches = useMemo(() => {
    return allMatches.filter((m) => {
      const year = m.date.substring(0, 4);
      return year === season;
    });
  }, [allMatches, season]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [matchdayFilter, setMatchdayFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<MatchSort>("date_desc");
  const [query, setQuery] = useState("");

  const matchdays = useMemo(
    () => [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b),
    [matches]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (matchdayFilter !== null && m.matchday !== matchdayFilter) return false;
      if (normalizedQuery) {
        const haystack =
          `${m.homeTeam} ${m.awayTeam} ${m.venue} ${m.date} matchday ${m.matchday}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [matches, statusFilter, matchdayFilter, query]);

  const sortedMatches = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort === "date_asc") return a.date.localeCompare(b.date) || a.matchId.localeCompare(b.matchId);
      if (sort === "matchday_desc") return b.matchday - a.matchday || b.date.localeCompare(a.date);
      if (sort === "matchday_asc") return a.matchday - b.matchday || a.date.localeCompare(b.date);
      if (sort === "team_asc") {
        return `${a.homeTeam} ${a.awayTeam}`.localeCompare(`${b.homeTeam} ${b.awayTeam}`);
      }
      return b.date.localeCompare(a.date) || b.matchId.localeCompare(a.matchId);
    });
  }, [filtered, sort]);

  // Group by matchday
  const grouped = useMemo(() => {
    const groups: Record<number, typeof sortedMatches> = {};
    for (const m of sortedMatches) {
      (groups[m.matchday] ??= []).push(m);
    }
    const direction = sort === "matchday_asc" || sort === "date_asc" || sort === "team_asc" ? 1 : -1;
    return Object.entries(groups)
      .map(([md, matches]) => ({ matchday: Number(md), matches }))
      .sort((a, b) => (a.matchday - b.matchday) * direction);
  }, [sortedMatches, sort]);

  return (
    <AppShell
      eyebrow="Match Analytics"
      title="Match Center"
      description={`${matches.length} real NWSL matches from the ${season} season. Data from ESPN.`}
    >
      <div className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team, venue, date, or matchday"
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-brand/40"
          />
          <select
            value={matchdayFilter ?? ""}
            onChange={(e) =>
              setMatchdayFilter(e.target.value ? Number(e.target.value) : null)
            }
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40"
          >
            <option value="">All matchdays</option>
            {matchdays.map((md) => (
              <option key={md} value={md}>
                Matchday {md}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as MatchSort)}
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="matchday_desc">Matchday high → low</option>
            <option value="matchday_asc">Matchday low → high</option>
            <option value="team_asc">Team A → Z</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setMatchdayFilter(null);
              setSort("date_desc");
              setQuery("");
            }}
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
          >
            Reset
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {(["all", "completed", "upcoming"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={
                  statusFilter === s
                    ? "rounded-full bg-brand/20 px-3 py-2 text-xs font-semibold capitalize text-brand-strong"
                    : "rounded-full px-3 py-2 text-xs font-semibold capitalize text-muted hover:bg-white/6 hover:text-foreground"
                }
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Showing {filtered.length} of {matches.length} matches across {matchdays.length} matchdays.
          </p>
        </div>
      </div>

      {/* Match Groups */}
      {matches.length > 0 && filtered.length > 0 ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.matchday}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">
                Matchday {group.matchday}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.matches.map((match) => (
                  <Link
                    key={match.matchId}
                    href={`/analytics/matches/${match.matchId}`}
                    className="glass-card rounded-xl border border-line bg-white/6 p-4 transition hover:border-brand/30"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">
                        {match.date}
                      </span>
                      <Pill
                        tone={
                          match.status === "completed"
                            ? "default"
                            : "brand"
                        }
                      >
                        {match.status === "completed" ? "FT" : "Upcoming"}
                      </Pill>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{match.homeTeam}</span>
                        <span className="font-mono text-lg font-semibold text-foreground">
                          {match.status === "completed" ? match.homeGoals : "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{match.awayTeam}</span>
                        <span className="font-mono text-lg font-semibold text-foreground">
                          {match.status === "completed" ? match.awayGoals : "-"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted/70">{match.venue}</div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : matches.length > 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">No matches match the current filters.</p>
        </div>
      ) : (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">
            Match fixtures and results will appear here once the API-Football fixture sync is configured.
          </p>
          <p className="mt-1 text-xs text-muted/60">
            Set the <code className="font-mono text-brand-strong">API_FOOTBALL_KEY</code> environment variable to enable live match data.
          </p>
        </div>
      )}
    </AppShell>
  );
}
