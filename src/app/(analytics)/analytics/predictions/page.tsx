import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { PredictionsClient } from "@/components/analytics/predictions-client";
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
      description="Match probabilities, stored market odds, and fail-closed pick status from the NWSL model pipeline."
    >
      <PredictionsClient predictions={predictions} />

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
