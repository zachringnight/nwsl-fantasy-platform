"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { StatComparisonBar } from "@/components/analytics/stat-comparison-bar";
import {
  getMatchDetail,
  getMatchPrediction,
  getPlayerIdByName,
} from "@/lib/analytics/analytics-data";
import {
  analyticsPlayerHref,
  analyticsPredictionHref,
  analyticsTeamHref,
  analyticsTeamId,
} from "@/lib/analytics/entity-routes";

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const match = useMemo(() => getMatchDetail(matchId), [matchId]);
  const prediction = useMemo(() => getMatchPrediction(matchId), [matchId]);

  if (!match) {
    return (
      <AppShell eyebrow="Match Analytics" title="Not Found" description="Match not found.">
        <Link href="/analytics/matches" className="text-sm text-brand-strong hover:underline">
          Back to matches
        </Link>
      </AppShell>
    );
  }

  const isCompleted = match.status === "completed";
  const hasDetailedStats = match.homeShots > 0 || match.awayShots > 0;

  return (
    <AppShell
      eyebrow={`Matchday ${match.matchday} · ${match.date}`}
      title={
        <>
          <Link
            href={analyticsTeamHref(match.homeTeamId)}
            className="hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.homeTeam}
          </Link>{" "}
          vs{" "}
          <Link
            href={analyticsTeamHref(match.awayTeamId)}
            className="hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.awayTeam}
          </Link>
        </>
      }
      description={match.venue}
      actions={
        <Link
          href="/analytics/matches"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All Matches
        </Link>
      }
    >
      {/* Score and connected team profiles */}
      <section className="flex items-center justify-center gap-6 py-4 sm:gap-10">
        <div className="min-w-0 flex-1 text-right">
          <Link
            href={analyticsTeamHref(match.homeTeamId)}
            className="text-lg font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.homeTeam}
          </Link>
          {isCompleted ? (
            <p className="font-display text-7xl leading-none text-foreground">
              {match.homeGoals}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-center">
          <Pill tone={isCompleted ? "default" : "brand"}>
            {isCompleted ? "FT" : "VS"}
          </Pill>
        </div>
        <div className="min-w-0 flex-1 text-left">
          <Link
            href={analyticsTeamHref(match.awayTeamId)}
            className="text-lg font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.awayTeam}
          </Link>
          {isCompleted ? (
            <p className="font-display text-7xl leading-none text-foreground">
              {match.awayGoals}
            </p>
          ) : null}
        </div>
      </section>

      {/* Stats Comparison */}
      {isCompleted && hasDetailedStats && (
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Match Stats
          </h3>
          <StatComparisonBar label="Shots" homeValue={match.homeShots} awayValue={match.awayShots} />
          <StatComparisonBar label="On Target" homeValue={match.homeShotsOnTarget} awayValue={match.awayShotsOnTarget} />
          <StatComparisonBar
            label="Possession"
            homeValue={match.homePossession}
            awayValue={match.awayPossession}
            format={(v) => `${v.toFixed(0)}%`}
          />
          <StatComparisonBar label="Corners" homeValue={match.homeCorners} awayValue={match.awayCorners} />
          <StatComparisonBar label="Fouls" homeValue={match.homeFouls} awayValue={match.awayFouls} />
        </section>
      )}

      {/* Match Info (when no detailed stats) */}
      {isCompleted && !hasDetailedStats && (
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricTile label="Venue" value={match.venue} />
            <MetricTile label="Date" value={match.date} />
            <MetricTile label="Status" value="Full Time" />
          </div>
        </section>
      )}

      {/* Match Events */}
      {isCompleted && match.events.length > 0 && (
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Match Timeline
          </h3>
          <div className="space-y-3">
            {match.events.map((event, i) => {
              const playerId = getPlayerIdByName(event.playerName);

              return (
                <div
                  key={`${event.minute}-${event.playerName}-${i}`}
                  className="flex items-center gap-4"
                >
                  <span className="w-10 text-right font-mono text-sm text-muted">
                    {event.minute}&apos;
                  </span>
                  <span className="flex size-6 items-center justify-center rounded-full bg-brand-strong/20 text-xs">
                    {event.type === "goal" ? "G" : event.type === "yellow_card" ? "Y" : event.type === "red_card" ? "R" : "S"}
                  </span>
                  <div>
                    {playerId ? (
                      <Link
                        href={analyticsPlayerHref(playerId)}
                        className="text-sm font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        {event.playerName}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-foreground">
                        {event.playerName}
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted">
                      (
                      <Link
                        href={analyticsTeamHref(analyticsTeamId(event.team))}
                        className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                      >
                        {event.team}
                      </Link>
                      )
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Prediction (for upcoming matches or as comparison) */}
      {prediction && (
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            {isCompleted ? "Pre-Match Prediction" : "Model Prediction"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricTile
              label={match.homeTeam}
              value={`${(prediction.homeProb * 100).toFixed(0)}%`}
              tone="brand"
            />
            <MetricTile
              label="Draw"
              value={`${(prediction.drawProb * 100).toFixed(0)}%`}
            />
            <MetricTile
              label={match.awayTeam}
              value={`${(prediction.awayProb * 100).toFixed(0)}%`}
              tone="accent"
            />
          </div>
          <div className="mt-4">
            <Link
              href={analyticsPredictionHref(matchId)}
              className="text-sm text-brand-strong hover:underline"
            >
              View full prediction details
            </Link>
          </div>
        </section>
      )}
    </AppShell>
  );
}
