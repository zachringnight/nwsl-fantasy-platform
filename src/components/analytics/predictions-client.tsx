"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { ProbabilityBar } from "@/components/analytics/charts/probability-bar";
import { Pill } from "@/components/ui/pill";
import type { MatchPrediction } from "@/types/analytics";

type PickFilter = "all" | "official_pick" | "lean" | "no_bet";
type OddsFilter = "all" | "fresh" | "missing" | "stale";
type PredictionSort = "date_asc" | "date_desc" | "pick" | "confidence" | "odds";

interface PredictionsClientProps {
  predictions: MatchPrediction[];
}

function formatDecimalOdds(value: number | undefined): string {
  if (value === undefined) return "—";
  return value.toFixed(2);
}

function readableReason(value: string | undefined): string {
  if (!value || value === "none") return "No edge";
  return value.replaceAll("_", " ");
}

function pickRank(prediction: MatchPrediction): number {
  const tier = prediction.pickSummary?.tier ?? prediction.topPickTier ?? "no_bet";
  if (tier === "official_pick") return 3;
  if (tier === "lean") return 2;
  return 1;
}

function oddsRank(prediction: MatchPrediction): number {
  const odds = prediction.marketOdds;
  if (!odds?.hasMarketOdds) return 0;
  return odds.marketIsFresh ? 2 : 1;
}

function PickBadge({ prediction }: { prediction: MatchPrediction }) {
  const tier = prediction.pickSummary?.tier ?? prediction.topPickTier ?? "no_bet";
  if (tier === "official_pick") return <Pill tone="success">Official pick</Pill>;
  if (tier === "lean") return <Pill tone="brand">Lean</Pill>;
  return <Pill>No pick</Pill>;
}

export function PredictionsClient({ predictions }: PredictionsClientProps) {
  const [pickFilter, setPickFilter] = useState<PickFilter>("all");
  const [oddsFilter, setOddsFilter] = useState<OddsFilter>("all");
  const [sort, setSort] = useState<PredictionSort>("date_asc");
  const [query, setQuery] = useState("");

  const filteredPredictions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return predictions
      .filter((prediction) => {
        const tier = prediction.pickSummary?.tier ?? prediction.topPickTier ?? "no_bet";
        const odds = prediction.marketOdds;
        if (pickFilter !== "all" && tier !== pickFilter) return false;
        if (oddsFilter === "fresh" && !odds?.marketIsFresh) return false;
        if (oddsFilter === "missing" && odds?.hasMarketOdds) return false;
        if (oddsFilter === "stale" && (!odds?.hasMarketOdds || odds.marketIsFresh)) return false;
        if (!normalizedQuery) return true;
        return `${prediction.homeTeam} ${prediction.awayTeam} ${prediction.date}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sort === "date_desc") return b.date.localeCompare(a.date);
        if (sort === "pick") return pickRank(b) - pickRank(a) || a.date.localeCompare(b.date);
        if (sort === "confidence") {
          const aConfidence = Math.max(a.homeProb, a.drawProb, a.awayProb);
          const bConfidence = Math.max(b.homeProb, b.drawProb, b.awayProb);
          return bConfidence - aConfidence || a.date.localeCompare(b.date);
        }
        if (sort === "odds") return oddsRank(b) - oddsRank(a) || a.date.localeCompare(b.date);
        return a.date.localeCompare(b.date);
      });
  }, [oddsFilter, pickFilter, predictions, query, sort]);

  const freshOddsCount = predictions.filter((prediction) => prediction.marketOdds?.marketIsFresh).length;
  const actionableCount = predictions.filter((prediction) => prediction.pickSummary?.actionable).length;

  if (predictions.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-muted">No upcoming predictions available.</p>
        <p className="mt-2 text-sm text-muted/60">
          Predictions appear when upcoming matches are scheduled.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search teams or date"
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-brand/40"
          />
          <select
            value={pickFilter}
            onChange={(event) => setPickFilter(event.target.value as PickFilter)}
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40"
          >
            <option value="all">All picks</option>
            <option value="official_pick">Official picks</option>
            <option value="lean">Leans</option>
            <option value="no_bet">No picks</option>
          </select>
          <select
            value={oddsFilter}
            onChange={(event) => setOddsFilter(event.target.value as OddsFilter)}
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40"
          >
            <option value="all">All odds states</option>
            <option value="fresh">Fresh odds</option>
            <option value="missing">Missing odds</option>
            <option value="stale">Stale odds</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as PredictionSort)}
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-foreground outline-none focus:border-brand/40"
          >
            <option value="date_asc">Date ↑</option>
            <option value="date_desc">Date ↓</option>
            <option value="pick">Pick tier</option>
            <option value="confidence">Model confidence</option>
            <option value="odds">Odds availability</option>
          </select>
        </div>
        <p className="mt-3 text-xs text-muted">
          Showing {filteredPredictions.length} of {predictions.length}. Fresh odds: {freshOddsCount}.
          Actionable picks: {actionableCount}. Picks are only surfaced when the model has a stored market
          price and clears the model gate.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredPredictions.map((pred) => (
          <Link
            key={pred.matchId}
            href={`/analytics/predictions/${pred.matchId}`}
            className="glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">
                {pred.date}
              </span>
              <PickBadge prediction={pred} />
            </div>

            <div className="mb-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{pred.homeTeam}</span>
                <span className="font-mono text-sm font-semibold text-brand-strong">
                  {(pred.homeProb * 100).toFixed(0)}%
                </span>
              </div>
              <ProbabilityBar
                homeProb={pred.homeProb}
                drawProb={pred.drawProb}
                awayProb={pred.awayProb}
                showPercentages={false}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{pred.awayTeam}</span>
                <span className="font-mono text-sm font-semibold text-accent">
                  {(pred.awayProb * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
              <div className="text-center">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted">Home</p>
                <p className="font-mono text-sm text-foreground">
                  {formatDecimalOdds(pred.marketOdds?.homeOdds)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted">Draw</p>
                <p className="font-mono text-sm text-foreground">
                  {formatDecimalOdds(pred.marketOdds?.drawOdds)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted">Away</p>
                <p className="font-mono text-sm text-foreground">
                  {formatDecimalOdds(pred.marketOdds?.awayOdds)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
              <div>
                <p className="text-[0.6rem] uppercase tracking-widest text-muted">
                  Total {pred.marketOdds?.totalLine ?? "—"}
                </p>
                <p className="font-mono text-sm text-foreground">
                  O {formatDecimalOdds(pred.marketOdds?.overOdds)} / U{" "}
                  {formatDecimalOdds(pred.marketOdds?.underOdds)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted">Reason</p>
                <p className="text-xs capitalize text-muted">
                  {readableReason(pred.pickSummary?.reason)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
              <span>
                {pred.marketOdds?.sportsbook ?? "No sportsbook"} ·{" "}
                {pred.marketOdds?.marketIsFresh ? "fresh" : "missing/stale"}
              </span>
              <span className="capitalize">{pred.model.replace("_", "-")}</span>
            </div>
          </Link>
        ))}
      </div>

      {filteredPredictions.length === 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">No predictions match the current filters.</p>
        </div>
      ) : null}
    </>
  );
}
