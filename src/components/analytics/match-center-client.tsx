"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import {
  analyticsMatchHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";
import { formatAmericanOdds } from "@/lib/odds-format";
import {
  browserStateHref,
  nextAvailableDate,
  resolveDateFilter,
  resolveMatchOrder,
  resolveStatusFilter,
  sortedUniqueDates,
  stableSortByDate,
  type MatchStatusFilter,
} from "@/lib/analytics/match-browser-state";
import type { MatchResult } from "@/types/analytics";

const statusFilters: MatchStatusFilter[] = [
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

export interface MatchCardOdds {
  matchId: string;
  sportsbook: string;
  marketType: "1x2" | "total";
  line: number | null;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

function showsScore(status: MatchResult["status"]): boolean {
  return status === "completed" || status === "live";
}

function dateLabel(value: string, weekday: "short" | "long" = "short"): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    weekday,
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function MatchCenterClient({
  matches,
  season,
  source,
  matchOdds = [],
}: {
  matches: MatchResult[];
  season: "2025" | "2026";
  source: string;
  matchOdds?: MatchCardOdds[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dates = useMemo(
    () => sortedUniqueDates(matches.map((match) => match.date)),
    [matches]
  );
  const dateCounts = useMemo(
    () =>
      matches.reduce<Record<string, number>>((counts, match) => {
        counts[match.date] = (counts[match.date] ?? 0) + 1;
        return counts;
      }, {}),
    [matches]
  );
  const statusFilter = resolveStatusFilter(searchParams.get("status"));
  const dateFilter = resolveDateFilter(searchParams.get("date"), dates);
  const order = resolveMatchOrder(searchParams.get("order"));
  const statusCounts = useMemo(
    () =>
      matches.reduce<Partial<Record<MatchResult["status"], number>>>(
        (counts, match) => {
          counts[match.status] = (counts[match.status] ?? 0) + 1;
          return counts;
        },
        {}
      ),
    [matches]
  );
  const oddsByMatch = useMemo(() => {
    const grouped = new Map<string, MatchCardOdds[]>();
    for (const odds of matchOdds) {
      const rows = grouped.get(odds.matchId);
      if (rows) {
        rows.push(odds);
      } else {
        grouped.set(odds.matchId, [odds]);
      }
    }
    return new Map(
      [...grouped].map(([matchId, rows]) => [
        matchId,
        rows.find(
          (row) =>
            row.marketType === "total" &&
            row.line !== null &&
            Math.abs(row.line - 2.5) <= 1e-9
        ) ??
          rows.find((row) => row.marketType === "total") ??
          rows[0],
      ])
    );
  }, [matchOdds]);
  const nextDate = useMemo(() => {
    const matchingStatus =
      statusFilter === "all"
        ? matches
        : matches.filter((match) => match.status === statusFilter);
    const activeDates = matchingStatus
      .filter((match) => match.status === "live" || match.status === "upcoming")
      .map((match) => match.date);

    return nextAvailableDate(
      activeDates.length > 0
        ? activeDates
        : matchingStatus.map((match) => match.date)
    );
  }, [matches, statusFilter]);
  const filtered = useMemo(() => {
    const selectedDate = dateFilter === "next" ? nextDate : dateFilter;
    const matching = matches.filter((match) => {
      if (statusFilter !== "all" && match.status !== statusFilter) return false;
      if (selectedDate !== "all" && match.date !== selectedDate) return false;
      return true;
    });

    return stableSortByDate(matching, order);
  }, [dateFilter, matches, nextDate, order, statusFilter]);
  const grouped = useMemo(() => {
    const groups = new Map<string, MatchResult[]>();
    for (const match of filtered) {
      const group = groups.get(match.date);
      if (group) {
        group.push(match);
      } else {
        groups.set(match.date, [match]);
      }
    }

    return [...groups].map(([date, matchRows]) => ({
      date,
      matches: matchRows,
    }));
  }, [filtered]);
  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      router.push(browserStateHref(pathname, searchParams, updates));
    },
    [pathname, router, searchParams]
  );
  const resetFilters = useCallback(() => {
    navigate({ date: "next", status: "all", order: "asc" });
  }, [navigate]);

  return (
    <AppShell
      eyebrow="Match Analytics"
      title="Match Center"
      description={`${matches.length} NWSL matches from the ${season} season. Data from ${source}.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Filter matches by status"
          className="flex flex-wrap gap-1"
        >
          {statusFilters.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => navigate({ status })}
              className={
                statusFilter === status
                  ? "rounded-full bg-brand/20 px-3 py-2 text-xs font-semibold capitalize text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/70 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
                  : "rounded-full px-3 py-2 text-xs font-semibold capitalize text-muted hover:bg-white/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/70 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
              }
            >
              {status}
              <span aria-hidden="true" className="ml-1 text-[0.65rem] opacity-65">
                {status === "all"
                  ? matches.length
                  : (statusCounts[status] ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="match-date-filter">
          Filter matches by date
        </label>
        <select
          id="match-date-filter"
          value={dateFilter}
          onChange={(event) => navigate({ date: event.target.value })}
          className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand-strong/50"
        >
          <option value="next">
            {nextDate ? `Next: ${dateLabel(nextDate)}` : "Next available date"}
          </option>
          <option value="all">All dates ({matches.length})</option>
          {dates.map((date) => (
            <option key={date} value={date}>
              {dateLabel(date)} ({dateCounts[date]})
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="match-order">
          Sort match dates
        </label>
        <select
          id="match-order"
          value={order}
          onChange={(event) => navigate({ order: event.target.value })}
          className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand-strong/50"
        >
          <option value="asc">Earliest first</option>
          <option value="desc">Latest first</option>
        </select>
      </div>

      {matches.length > 0 && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-sm text-muted"
        >
          {filtered.length} of {matches.length} matches shown
        </p>
      )}

      {filtered.length > 0 ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.date}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">
                {dateLabel(group.date, "long")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.matches.map((match) => {
                  const marketOdds = oddsByMatch.get(match.matchId);
                  return (
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
                      {match.status === "upcoming" ||
                      match.status === "live" ? (
                        <div className="mt-3 rounded-lg border border-line/70 bg-black/10 px-3 py-2 text-xs">
                          {marketOdds ? (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-muted">
                                  {marketOdds.sportsbook}
                                </span>
                                <span className="uppercase tracking-widest text-muted/70">
                                  {marketOdds.marketType === "total"
                                    ? `Total ${marketOdds.line?.toFixed(1) ?? "—"}`
                                    : "1X2"}
                                </span>
                              </div>
                              <p className="mt-1 font-mono text-foreground">
                                {marketOdds.marketType === "total"
                                  ? `O ${formatAmericanOdds(marketOdds.overOdds)} · U ${formatAmericanOdds(marketOdds.underOdds)}`
                                  : `H ${formatAmericanOdds(marketOdds.homeOdds)} · D ${formatAmericanOdds(marketOdds.drawOdds)} · A ${formatAmericanOdds(marketOdds.awayOdds)}`}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted/70">Odds not posted</p>
                          )}
                        </div>
                      ) : null}
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
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : matches.length > 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">
            No matches match the current status and date filters.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-full border border-brand-strong/30 bg-brand/15 px-4 py-2 text-sm font-semibold text-brand-strong transition hover:bg-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/70 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            Clear match filters
          </button>
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
