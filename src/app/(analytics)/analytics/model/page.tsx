"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { ThemedLineChart } from "@/components/analytics/charts/themed-line-chart";
import { ThemedBarChart } from "@/components/analytics/charts/themed-bar-chart";
import { getModelPerformance } from "@/lib/analytics/analytics-data";

export default function ModelPage() {
  const perf = useMemo(() => getModelPerformance(), []);

  if (!perf) {
    return (
      <AppShell
        eyebrow="Predictive Models"
        title="Model Transparency"
        description="How our prediction model works, its accuracy metrics, and calibration performance."
      >
        {/* Methodology (always shown) */}
        <MethodologySection />

        {/* Empty state for metrics */}
        <div className="rounded-[1.4rem] border border-dashed border-line bg-white/4 p-8 text-center">
          <p className="text-sm text-muted">
            Model performance metrics will appear here after the prediction model has been trained and backtested.
          </p>
          <p className="mt-1 text-xs text-muted/60">
            Run <code className="font-mono text-brand-strong">pnpm model:export</code> after training to generate performance data.
          </p>
        </div>
      </AppShell>
    );
  }

  const calibrationData = perf.calibrationBuckets.map((b) => ({
    predicted: `${(b.predicted * 100).toFixed(0)}%`,
    "Predicted": b.predicted * 100,
    "Actual": b.actual * 100,
    "Perfect": b.predicted * 100,
  }));

  return (
    <AppShell
      eyebrow="Predictive Models"
      title="Model Transparency"
      description="How our prediction model works, its accuracy metrics, and calibration performance."
    >
      {/* Key Metrics */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricTile
          label="Log Loss"
          value={perf.logLoss.toFixed(3)}
          detail="Lower is better"
          tone="brand"
        />
        <MetricTile
          label="Brier Score"
          value={perf.brierScore.toFixed(3)}
          detail="Lower is better"
          tone="brand"
        />
        <MetricTile
          label="Calibration"
          value={perf.calibrationError.toFixed(3)}
          detail="Lower is better"
        />
        <MetricTile
          label="Hit Rate"
          value={`${(perf.hitRate * 100).toFixed(1)}%`}
          detail="Correct outcomes"
        />
        <MetricTile
          label="ROI"
          value={`${(perf.roi * 100).toFixed(1)}%`}
          detail="Return on investment"
          tone={perf.roi >= 0 ? "brand" : "accent"}
        />
        <MetricTile
          label="Predictions"
          value={perf.totalPredictions}
          detail="Total matches"
        />
      </section>

      {/* Calibration Chart */}
      <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Calibration Plot
        </h3>
        <p className="mb-4 text-sm text-muted">
          A well-calibrated model produces actual outcomes matching predicted probabilities.
          The closer the blue line tracks the dashed perfect line, the better the calibration.
        </p>
        <ThemedLineChart
          data={calibrationData}
          xKey="predicted"
          lines={[
            { dataKey: "Actual", label: "Actual Frequency", color: "#00e1ff" },
            { dataKey: "Perfect", label: "Perfect Calibration", color: "#b6c0d9", dashed: true },
          ]}
          height={350}
        />
      </section>

      {/* Sample Size Per Bucket */}
      <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Predictions Per Probability Bucket
        </h3>
        <p className="mb-4 text-sm text-muted">
          Number of predictions in each probability range. More samples improve calibration reliability.
        </p>
        <ThemedBarChart
          data={perf.calibrationBuckets.map((b) => ({
            bucket: `${(b.predicted * 100).toFixed(0)}%`,
            count: b.count,
          }))}
          xKey="bucket"
          bars={[{ dataKey: "count", label: "Predictions", color: "#0522ff" }]}
          height={250}
        />
      </section>

      {/* Methodology */}
      <MethodologySection />
    </AppShell>
  );
}

function MethodologySection() {
  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 space-y-6">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
        Methodology
      </h3>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h4 className="text-base font-semibold text-foreground">Score Prediction Framework</h4>
          <p className="text-sm text-muted leading-relaxed">
            We predict the full regulation-time scoreline distribution P(home_goals=i, away_goals=j)
            and derive all betting markets from a single 9x9 score matrix. This ensures mathematical
            consistency across all markets: 1X2, over/under, BTTS, and Asian handicaps all come from
            the same probability distribution.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-base font-semibold text-foreground">Dynamic Dixon-Coles</h4>
          <p className="text-sm text-muted leading-relaxed">
            Our primary model uses independent Poisson distributions with a low-score correction
            (rho parameter) to adjust for the empirical under-representation of 0-0 and 1-1 draws.
            Team attack and defense parameters are estimated via maximum likelihood with exponential
            decay weighting, giving recent matches more influence.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-base font-semibold text-foreground">Team Ratings</h4>
          <p className="text-sm text-muted leading-relaxed">
            Team strength ratings are driven by non-penalty expected goals (npxG) rather than raw
            goals, reducing noise from penalty kicks and luck. New teams receive league-average priors
            with configurable shrinkage. Season-to-season carryover is 60% by default.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-base font-semibold text-foreground">Backtesting</h4>
          <p className="text-sm text-muted leading-relaxed">
            All metrics use strict expanding-window time splits with no random shuffling. Each fold
            trains only on past data and predicts future matches, ensuring no information leakage.
            We benchmark against market-implied probabilities to validate model edge.
          </p>
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <h4 className="mb-2 text-base font-semibold text-foreground">Data Sources</h4>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted">
          <li>Match results and xG data from API-Football</li>
          <li>NWSL regular season matches (2022-2026)</li>
          <li>Models retrained weekly during the active season</li>
          <li>Feature pipeline includes schedule, travel, and weather context</li>
        </ul>
      </div>
    </section>
  );
}
