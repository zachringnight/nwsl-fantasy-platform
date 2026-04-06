"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import { getMatchResults } from "@/lib/analytics/analytics-data";

type StatusFilter = "all" | "completed" | "upcoming";

export default function MatchesPage() {
  const matches = useMemo(() => getMatchResults(), []);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [matchdayFilter, setMatchdayFilter] = useState<number | null>(null);

  const matchdays = useMemo(
    () => [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b),
    [matches]
  );

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (matchdayFilter !== null && m.matchday !== matchdayFilter) return false;
      return true;
    });
  }, [matches, statusFilter, matchdayFilter]);

  // Group by matchday
  const grouped = useMemo(() => {
    const groups: Record<number, typeof filtered> = {};
    for (const m of filtered) {
      (groups[m.matchday] ??= []).push(m);
    }
    return Object.entries(groups)
      .map(([md, matches]) => ({ matchday: Number(md), matches }))
      .sort((a, b) => b.matchday - a.matchday);
  }, [filtered]);

  return (
    <AppShell
      eyebrow="Match Analytics"
      title="Match Center"
      description={`${matches.length} real NWSL matches from the 2025 and 2026 seasons. Data from ESPN.`}
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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
        <select
          value={matchdayFilter ?? ""}
          onChange={(e) =>
            setMatchdayFilter(e.target.value ? Number(e.target.value) : null)
          }
          className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40"
        >
          <option value="">All Matchdays</option>
          {matchdays.map((md) => (
            <option key={md} value={md}>
              Matchday {md}
            </option>
          ))}
        </select>
      </div>

      {/* Match Groups */}
      {matches.length > 0 ? (
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
