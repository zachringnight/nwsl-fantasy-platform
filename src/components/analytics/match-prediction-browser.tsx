"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { ProbabilityBar } from "@/components/analytics/charts/probability-bar";
import { Pill } from "@/components/ui/pill";
import {
  analyticsMatchHref,
  analyticsPredictionHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";
import {
  browserStateHref,
  nextAvailableDate,
  resolveDateFilter,
  resolveMatchOrder,
  sortedUniqueDates,
  stableSortByDate,
} from "@/lib/analytics/match-browser-state";
import type { MatchPrediction } from "@/types/analytics";

function dateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function MatchPredictionBrowser({
  predictions,
  season,
}: {
  predictions: MatchPrediction[];
  season: "2025" | "2026";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dates = useMemo(
    () => sortedUniqueDates(predictions.map((prediction) => prediction.date)),
    [predictions]
  );
  const dateCounts = useMemo(
    () =>
      predictions.reduce<Record<string, number>>((counts, prediction) => {
        counts[prediction.date] = (counts[prediction.date] ?? 0) + 1;
        return counts;
      }, {}),
    [predictions]
  );
  const dateFilter = resolveDateFilter(searchParams.get("date"), dates);
  const order = resolveMatchOrder(searchParams.get("order"));
  const nextDate = useMemo(
    () => nextAvailableDate(predictions.map((prediction) => prediction.date)),
    [predictions]
  );
  const filteredPredictions = useMemo(() => {
    const selectedDate = dateFilter === "next" ? nextDate : dateFilter;
    const matching =
      selectedDate === "all"
        ? predictions
        : predictions.filter(
            (prediction) => prediction.date === selectedDate
          );

    return stableSortByDate(matching, order);
  }, [dateFilter, nextDate, order, predictions]);
  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      router.push(browserStateHref(pathname, searchParams, updates));
    },
    [pathname, router, searchParams]
  );

  return (
    <section>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Match probabilities
          </h2>
          <p className="mt-1 text-sm text-muted">
            Full score-model projections feed broad positive-edge research
            across fresh 1X2 and totals markets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="prediction-date"
            className="text-xs font-semibold uppercase tracking-widest text-muted"
          >
            Match date
          </label>
          <select
            id="prediction-date"
            value={dateFilter}
            onChange={(event) => navigate({ date: event.target.value })}
            className="rounded-full border border-line bg-panel-strong px-4 py-2 text-sm text-foreground outline-none transition focus:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand-strong/55"
          >
            <option value="next">
              {nextDate ? `Next: ${dateLabel(nextDate)}` : "Next available date"}
            </option>
            <option value="all">All dates ({predictions.length})</option>
            {dates.map((date) => (
              <option key={date} value={date}>
                {dateLabel(date)} ({dateCounts[date]})
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="prediction-order">
            Sort prediction dates
          </label>
          <select
            id="prediction-order"
            value={order}
            onChange={(event) => navigate({ order: event.target.value })}
            className="rounded-full border border-line bg-panel-strong px-4 py-2 text-sm text-foreground outline-none transition focus:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand-strong/55"
          >
            <option value="asc">Earliest first</option>
            <option value="desc">Latest first</option>
          </select>
          <span
            className="text-xs text-muted"
            aria-live="polite"
            aria-atomic="true"
          >
            {filteredPredictions.length}{" "}
            {filteredPredictions.length === 1 ? "match" : "matches"}
          </span>
        </div>
      </div>

      {filteredPredictions.length === 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">
            No model projections are available for this match date.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPredictions.map((prediction) => (
            <article
              key={prediction.matchId}
              className="glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
            >
              <div className="mb-3 flex items-center justify-between">
                <Link
                  href={analyticsPredictionHref(prediction.matchId, season)}
                  aria-label={`Open prediction for ${prediction.homeTeam} vs ${prediction.awayTeam}`}
                  className="text-[0.65rem] font-medium uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  {dateLabel(prediction.date)}
                </Link>
                <Pill tone="accent">AI Prediction</Pill>
              </div>

              <div className="mb-4 space-y-1">
                <div className="flex items-center justify-between">
                  <Link
                    href={analyticsTeamHref(prediction.homeTeamId, season)}
                    className="text-sm font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {prediction.homeTeam}
                  </Link>
                  <span className="font-mono text-sm font-semibold text-brand-strong">
                    {(prediction.homeProb * 100).toFixed(0)}%
                  </span>
                </div>
                <ProbabilityBar
                  homeProb={prediction.homeProb}
                  drawProb={prediction.drawProb}
                  awayProb={prediction.awayProb}
                  showPercentages={false}
                />
                <div className="flex items-center justify-between">
                  <Link
                    href={analyticsTeamHref(prediction.awayTeamId, season)}
                    className="text-sm font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {prediction.awayTeam}
                  </Link>
                  <span className="font-mono text-sm font-semibold text-accent">
                    {(prediction.awayProb * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
                <div className="text-center">
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted">
                    BTTS
                  </p>
                  <p className="font-mono text-sm text-foreground">
                    {(prediction.bttsYesProb * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted">
                    O2.5
                  </p>
                  <p className="font-mono text-sm text-foreground">
                    {prediction.overUnder["2.5"]
                      ? (prediction.overUnder["2.5"].over * 100).toFixed(0)
                      : "—"}
                    %
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted">
                    Draw
                  </p>
                  <p className="font-mono text-sm text-foreground">
                    {(prediction.drawProb * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                <span>
                  Expected: {prediction.lambdaHome.toFixed(1)} -{" "}
                  {prediction.lambdaAway.toFixed(1)}
                </span>
                <span className="capitalize">
                  {prediction.model.replace("_", "-")}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Link
                  href={analyticsMatchHref(prediction.matchId, season)}
                  className="text-xs text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Match page
                </Link>
                <Link
                  href={analyticsPredictionHref(prediction.matchId, season)}
                  className="text-xs font-semibold text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Full prediction
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
