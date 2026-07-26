import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import { ProbabilityBar } from "@/components/analytics/charts/probability-bar";
import { LiveModelPicks } from "@/components/analytics/live-model-picks";
import { getMatchPredictions } from "@/lib/analytics/analytics-data";
import { getLiveModelBoard } from "@/lib/analytics/live-model-board";
import {
  analyticsMatchHref,
  analyticsPredictionHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";

export const metadata = {
  title: "Predictions",
  description:
    "Daily NWSL model picks, tracked results, and upcoming match probabilities.",
};

export const revalidate = 300;

export default async function PredictionsPage() {
  const predictions = getMatchPredictions();
  const liveModelBoard = await getLiveModelBoard();

  return (
    <AppShell
      eyebrow="Predictive Models"
      title="Predictions"
      description="Daily frozen-policy picks, tracked results, and match probabilities from the NWSL model lab."
    >
      {liveModelBoard ? <LiveModelPicks board={liveModelBoard} /> : null}

      {predictions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-muted">No upcoming predictions available.</p>
          <p className="mt-2 text-sm text-muted/60">
            Predictions appear when upcoming matches are scheduled.
          </p>
        </div>
      ) : (
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-foreground">Match probabilities</h2>
            <p className="mt-1 text-sm text-muted">
              Full score-model projections are separate from threshold-clearing policy picks.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {predictions.map((pred) => (
              <article
                key={pred.matchId}
                className="glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
              >
                {/* Header */}
                <div className="mb-3 flex items-center justify-between">
                  <Link
                    href={analyticsPredictionHref(pred.matchId)}
                    aria-label={`Open prediction for ${pred.homeTeam} vs ${pred.awayTeam}`}
                    className="text-[0.65rem] font-medium uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {pred.date}
                  </Link>
                  <Pill tone="accent">AI Prediction</Pill>
                </div>

                {/* Teams */}
                <div className="mb-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <Link
                      href={analyticsTeamHref(pred.homeTeamId)}
                      className="text-sm font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {pred.homeTeam}
                    </Link>
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
                    <Link
                      href={analyticsTeamHref(pred.awayTeamId)}
                      className="text-sm font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {pred.awayTeam}
                    </Link>
                    <span className="font-mono text-sm font-semibold text-accent">
                      {(pred.awayProb * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Key Markets */}
                <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
                  <div className="text-center">
                    <p className="text-[0.6rem] uppercase tracking-widest text-muted">BTTS</p>
                    <p className="font-mono text-sm text-foreground">
                      {(pred.bttsYesProb * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[0.6rem] uppercase tracking-widest text-muted">O2.5</p>
                    <p className="font-mono text-sm text-foreground">
                      {pred.overUnder["2.5"]
                        ? (pred.overUnder["2.5"].over * 100).toFixed(0)
                        : "—"}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[0.6rem] uppercase tracking-widest text-muted">Draw</p>
                    <p className="font-mono text-sm text-foreground">
                      {(pred.drawProb * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* Expected Goals */}
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                  <span>Expected: {pred.lambdaHome.toFixed(1)} - {pred.lambdaAway.toFixed(1)}</span>
                  <span className="capitalize">{pred.model.replace("_", "-")}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Link
                    href={analyticsMatchHref(pred.matchId)}
                    className="text-xs text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    Match page
                  </Link>
                  <Link
                    href={analyticsPredictionHref(pred.matchId)}
                    className="text-xs font-semibold text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    Full prediction
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Model info */}
      <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
              About the Model
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Predictions use a Dynamic Dixon-Coles model that computes the full joint score
              distribution P(home=i, away=j) for each match. All markets — 1X2, over/under,
              BTTS, Asian handicaps — derive from a single score matrix. Team strength ratings
              are driven by non-penalty expected goals (npxG) with exponential decay weighting.
            </p>
          </div>
          <Link
            href="/analytics/model"
            className="shrink-0 rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
          >
            Model Details
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
