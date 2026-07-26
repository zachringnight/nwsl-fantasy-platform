import { AppShell } from "@/components/common/app-shell";
import { LiveModelPicks } from "@/components/analytics/live-model-picks";
import { MatchPredictionBrowser } from "@/components/analytics/match-prediction-browser";
import { getMatchPredictions } from "@/lib/analytics/analytics-data";
import { getLiveModelBoard } from "@/lib/analytics/live-model-board";
import Link from "next/link";

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
        <MatchPredictionBrowser predictions={predictions} />
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
