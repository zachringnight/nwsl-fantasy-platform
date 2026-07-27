"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import {
  analyticsMatchHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";
import type { MatchResult } from "@/types/analytics";

type StatusFilter = "all" | MatchResult["status"];

const statusFilters: StatusFilter[] = [
  "all",
  "completed",
  "live",
  "upcoming",
  "postponed",
  "canceled",
];

const statusLabels: Record<MatchResult["status"], string> = {
  completed: "FT",
  live: "LIVE",
  upcoming: "Upcoming",
  postponed: "Postponed",
  canceled: "Canceled",
};

function showsScore(status: MatchResult["status"]): boolean {
  return status === "completed" || status === "live";
}

export function MatchCenterClient({
  matches,
  season,
  source,
}: {
  matches: MatchResult[];
  season: "2025" | "2026";
  source: string;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [matchdayFilter, setMatchdayFilter] = useState<number | null>(null);
  const matchdays = useMemo(
    () => [...new Set(matches.map((match) => match.matchday))].sort((a, b) => a - b),
    [matches]
  );
  const filtered = useMemo(
    () =>
      matches.filter((match) => {
        if (statusFilter !== "all" && match.status !== statusFilter) return false;
        if (matchdayFilter !== null && match.matchday !== matchdayFilter) return false;
        return true;
      }),
    [matches, statusFilter, matchdayFilter]
  );
  const grouped = useMemo(() => {
    const groups: Record<number, MatchResult[]> = {};
    for (const match of filtered) {
      (groups[match.matchday] ??= []).push(match);
    }
    return Object.entries(groups)
      .map(([matchday, matchRows]) => ({
        matchday: Number(matchday),
        matches: matchRows,
      }))
      .sort((left, right) => right.matchday - left.matchday);
  }, [filtered]);

  return (
    <AppShell
      eyebrow="Match Analytics"
      title="Match Center"
      description={`${matches.length} NWSL matches from the ${season} season. Data from ${source}.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {statusFilters.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={
                statusFilter === status
                  ? "rounded-full bg-brand/20 px-3 py-2 text-xs font-semibold capitalize text-brand-strong"
                  : "rounded-full px-3 py-2 text-xs font-semibold capitalize text-muted hover:bg-white/6 hover:text-foreground"
              }
            >
              {status}
            </button>
          ))}
        </div>
        <select
          value={matchdayFilter ?? ""}
          onChange={(event) =>
            setMatchdayFilter(event.target.value ? Number(event.target.value) : null)
          }
          className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40"
        >
          <option value="">All Matchdays</option>
          {matchdays.map((matchday) => (
            <option key={matchday} value={matchday}>
              Matchday {matchday}
            </option>
          ))}
        </select>
      </div>

      {matches.length > 0 ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.matchday}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">
                Matchday {group.matchday}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.matches.map((match) => (
                  <article
                    key={match.officialMatchId ?? match.matchId}
                    className="glass-card rounded-xl border border-line bg-white/6 p-4 transition hover:border-brand/30"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Link
                        href={analyticsMatchHref(match.matchId, season)}
                        aria-label={`Open ${match.homeTeam} vs ${match.awayTeam}`}
                        className="text-[0.65rem] font-medium uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        {match.date}
                      </Link>
                      <Pill
                        tone={
                          match.status === "live"
                            ? "accent"
                            : match.status === "upcoming"
                              ? "brand"
                              : "default"
                        }
                      >
                        {statusLabels[match.status]}
                      </Pill>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Link
                          href={analyticsTeamHref(match.homeTeamId, season)}
                          className="text-sm text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                        >
                          {match.homeTeam}
                        </Link>
                        <span className="font-mono text-lg font-semibold text-foreground">
                          {showsScore(match.status) ? match.homeGoals : "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <Link
                          href={analyticsTeamHref(match.awayTeamId, season)}
                          className="text-sm text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                        >
                          {match.awayTeam}
                        </Link>
                        <span className="font-mono text-lg font-semibold text-foreground">
                          {showsScore(match.status) ? match.awayGoals : "-"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/70 pt-3">
                      <span className="truncate text-xs text-muted/70">
                        {match.venue}
                      </span>
                      <Link
                        href={analyticsMatchHref(match.matchId, season)}
                        className="shrink-0 text-xs font-medium text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        Match details
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">
            No match records are available for this season.
          </p>
        </div>
      )}
    </AppShell>
  );
}
