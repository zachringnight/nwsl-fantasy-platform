import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { Pill } from "@/components/ui/pill";
import { ProbabilityBar } from "@/components/analytics/charts/probability-bar";
import { getMatchPredictions } from "@/lib/analytics/analytics-data";

export const metadata = {
  title: "Predictions",
  description: "AI model predictions for upcoming NWSL matches — win probabilities, BTTS, over/under.",
};

export default function PredictionsPage() {
  const predictions = getMatchPredictions();

  return (
    <AppShell
      eyebrow="Predictive Models"
      title="Predictions"
      description="Match outcome probabilities powered by Dixon-Coles and Bivariate Poisson score models trained on NWSL data."
    >
      {predictions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-muted">No upcoming predictions available.</p>
          <p className="mt-2 text-sm text-muted/60">
            Predictions appear when upcoming matches are scheduled.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {predictions.map((pred) => (
            <Link
              key={pred.matchId}
              href={`/analytics/predictions/${pred.matchId}`}
              className="glass-card rounded-[1.4rem] border border-line bg-white/6 p-5 transition hover:border-brand/30"
            >
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">
                  {pred.date}
                </span>
                <Pill tone="accent">AI Prediction</Pill>
              </div>

              {/* Teams */}
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
            </Link>
          ))}
        </div>
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
