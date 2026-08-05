import { AppShell } from "@/components/common/app-shell";
import { MatchPredictionBrowser } from "@/components/analytics/match-prediction-browser";
import { getMatchPredictions } from "@/lib/analytics/general-predictions-data";
import Link from "next/link";

export const metadata = {
  title: "Predictions",
  description:
    "Traceable NWSL match probabilities and research-only model analysis.",
};

export const revalidate = 300;

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const query = await searchParams;
  const season = query.season === "2025" ? "2025" : "2026";
  const predictions = (await getMatchPredictions()).filter((prediction) =>
    prediction.date.startsWith(`${season}-`)
  );
  return (
    <AppShell
      eyebrow="Predictive Models"
      title="Predictions"
      description={`${season} match probabilities and broad model-edge research from the NWSL model lab.`}
    >
      {predictions[0] ? (
        <section
          className={`rounded-[1.4rem] border p-5 ${
            predictions[0].isStale ||
            predictions[0].gatingStatus === "degraded_context"
              ? "border-amber-400/35 bg-amber-400/8"
              : "border-line bg-white/4"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
                General probability lineage
              </h2>
              <p className="mt-2 text-sm text-muted">
                {predictions[0].modelFamily ?? predictions[0].model} · version{" "}
                {predictions[0].modelVersion ?? "unversioned"} · trained through{" "}
                {predictions[0].trainingCutoff ?? "an unavailable cutoff"}
              </p>
            </div>
            <span className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              {predictions[0].dataSource === "static_fallback"
                ? "Stale static fallback"
                : predictions[0].isStale
                  ? "Stale live snapshot"
                  : predictions[0].gatingStatus === "degraded_context"
                    ? "Partial context"
                    : "Current"}
            </span>
          </div>
          {predictions[0].gatingStatus === "degraded_context" ? (
            <p className="mt-3 text-sm text-amber-100/80">
              Match probabilities use the refreshed result set, but player or
              projected-lineup coverage is partial and is not labeled current.
            </p>
          ) : null}
        </section>
      ) : null}

      {predictions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-muted">
            No {season} model projections available.
          </p>
          <p className="mt-2 text-sm text-muted/60">
            Predictions appear when upcoming matches are scheduled.
          </p>
        </div>
      ) : (
        <MatchPredictionBrowser predictions={predictions} season={season} />
      )}

      {/* Model info */}
      <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
              About the Model
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              General match probabilities use the traceable SPI-lite baseline
              and its Poisson score matrix. The active research feed evaluates
              positive model edges across fresh 1X2 and totals quotes; it does
              not place wagers.
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
