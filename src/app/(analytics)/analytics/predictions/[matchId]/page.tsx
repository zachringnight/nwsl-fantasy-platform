import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { ModelMarketOdds } from "@/components/analytics/model-market-odds";
import { MetricTile } from "@/components/ui/metric-tile";
import { ProbabilityBar } from "@/components/analytics/charts/probability-bar";
import { ScoreMatrixHeatmap } from "@/components/analytics/charts/score-matrix-heatmap";
import { getMatchPrediction } from "@/lib/analytics/analytics-data";
import {
  getArchivedPrematchModelMarket,
  getLiveModelBoard,
} from "@/lib/analytics/live-model-board";
import {
  analyticsMatchHref,
  analyticsTeamHref,
} from "@/lib/analytics/entity-routes";
import { formatAmericanOdds } from "@/lib/odds-format";

export const dynamic = "force-dynamic";

export default async function PredictionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  const season = query.season === "2025" ? "2025" : "2026";
  const liveModelBoard =
    season === "2026" ? await getLiveModelBoard() : null;
  const prediction = getMatchPrediction(matchId);

  if (!prediction || !prediction.date.startsWith(`${season}-`)) {
    return (
      <AppShell eyebrow="Predictions" title="Not Found" description="Prediction not found.">
        <Link
          href={`/analytics/predictions${season === "2025" ? "?season=2025" : ""}`}
          className="text-sm text-brand-strong hover:underline"
        >
          Back to predictions
        </Link>
      </AppShell>
    );
  }

  const ouLines = Object.entries(prediction.overUnder).sort(
    ([a], [b]) => parseFloat(a) - parseFloat(b)
  );

  const ahLines = Object.entries(prediction.asianHandicap).sort(
    ([a], [b]) => parseFloat(a) - parseFloat(b)
  );
  const activeBoard = season === "2026" ? liveModelBoard : null;
  let marketRow = activeBoard?.slate.find(
    (row) => row.matchId === matchId
  );
  let marketOdds =
    activeBoard?.odds.filter((row) => row.matchId === matchId) ?? [];
  let marketArchived = false;
  if (season === "2026" && marketOdds.length === 0) {
    const archivedMarket = await getArchivedPrematchModelMarket({ matchId });
    if (archivedMarket?.odds.length) {
      marketRow = archivedMarket.modelRow;
      marketOdds = archivedMarket.odds;
      marketArchived = true;
    }
  }
  const generatedLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(prediction.timestamp));

  return (
    <AppShell
      eyebrow={`Prediction · ${prediction.date}`}
      title={
        <>
          <Link
            href={analyticsTeamHref(prediction.homeTeamId, season)}
            className="hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {prediction.homeTeam}
          </Link>{" "}
          vs{" "}
          <Link
            href={analyticsTeamHref(prediction.awayTeamId, season)}
            className="hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {prediction.awayTeam}
          </Link>
        </>
      }
      description={`${prediction.model.replace("_", "-")} model · Generated ${generatedLabel}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href={analyticsTeamHref(prediction.homeTeamId, season)}
            className="inline-flex items-center rounded-full border border-line bg-white/6 px-3 py-2 text-sm text-muted transition hover:border-brand/30 hover:text-brand-strong"
          >
            {prediction.homeTeam}
          </Link>
          <Link
            href={analyticsTeamHref(prediction.awayTeamId, season)}
            className="inline-flex items-center rounded-full border border-line bg-white/6 px-3 py-2 text-sm text-muted transition hover:border-brand/30 hover:text-brand-strong"
          >
            {prediction.awayTeam}
          </Link>
          <Link
            href={analyticsMatchHref(matchId, season)}
            className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-strong transition hover:border-brand-strong/50"
          >
            Match page
          </Link>
          <Link
            href={`/analytics/predictions${season === "2025" ? "?season=2025" : ""}`}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-3 py-2 text-sm text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            All Predictions
          </Link>
        </div>
      }
    >
      {/* 1X2 Probabilities */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Match Result Probabilities
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricTile
            label={prediction.homeTeam}
            value={`${(prediction.homeProb * 100).toFixed(1)}%`}
            detail={`Fair odds: ${formatAmericanOdds(1 / prediction.homeProb)}`}
            tone="brand"
          />
          <MetricTile
            label="Draw"
            value={`${(prediction.drawProb * 100).toFixed(1)}%`}
            detail={`Fair odds: ${formatAmericanOdds(1 / prediction.drawProb)}`}
          />
          <MetricTile
            label={prediction.awayTeam}
            value={`${(prediction.awayProb * 100).toFixed(1)}%`}
            detail={`Fair odds: ${formatAmericanOdds(1 / prediction.awayProb)}`}
            tone="accent"
          />
        </div>
        <ProbabilityBar
          homeProb={prediction.homeProb}
          drawProb={prediction.drawProb}
          awayProb={prediction.awayProb}
          homeLabel={prediction.homeTeam}
          awayLabel={prediction.awayTeam}
        />
      </section>

      <ModelMarketOdds
        odds={marketOdds}
        modelRow={marketRow}
        heading={marketArchived ? "Archived pre-match odds" : "Market odds"}
        archived={marketArchived}
      />

      {/* Score Matrix */}
      <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
          Score Matrix
        </h3>
        <p className="mb-4 text-sm text-muted">
          Joint probability distribution for the final score. Each cell shows
          P(home={"{i}"}, away={"{j}"}) — the likelihood of that exact scoreline.
        </p>
        <ScoreMatrixHeatmap
          matrix={prediction.scoreMatrix}
          homeTeam={prediction.homeTeam}
          awayTeam={prediction.awayTeam}
        />
      </section>

      {/* Expected Goals */}
      <section className="grid gap-4 sm:grid-cols-2">
        <MetricTile
          label={`${prediction.homeTeam} Expected Goals`}
          value={prediction.lambdaHome.toFixed(2)}
          detail="Poisson lambda parameter"
          tone="brand"
        />
        <MetricTile
          label={`${prediction.awayTeam} Expected Goals`}
          value={prediction.lambdaAway.toFixed(2)}
          detail="Poisson lambda parameter"
          tone="accent"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Over/Under */}
        <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
            Over/Under
          </h3>
          <div className="space-y-3">
            {ouLines.map(([line, probs]) => (
              <div key={line} className="flex items-center justify-between">
                <span className="text-sm text-muted">Total {line}</span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="font-mono text-sm text-brand-strong">
                      O {(probs.over * 100).toFixed(0)}%
                    </span>
                    <span className="mx-2 text-xs text-muted">/</span>
                    <span className="font-mono text-sm text-accent">
                      U {(probs.under * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex h-2 w-24 overflow-hidden rounded-full">
                    <div className="bg-brand-strong" style={{ width: `${probs.over * 100}%` }} />
                    <div className="bg-accent" style={{ width: `${probs.under * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BTTS & Asian Handicap */}
        <div className="space-y-6">
          {/* BTTS */}
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Both Teams to Score
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-2xl font-semibold text-brand-strong">
                  {(prediction.bttsYesProb * 100).toFixed(0)}%
                </span>
                <span className="ml-2 text-sm text-muted">Yes</span>
              </div>
              <div>
                <span className="font-mono text-2xl font-semibold text-accent">
                  {((1 - prediction.bttsYesProb) * 100).toFixed(0)}%
                </span>
                <span className="ml-2 text-sm text-muted">No</span>
              </div>
            </div>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
              <div className="bg-brand-strong" style={{ width: `${prediction.bttsYesProb * 100}%` }} />
              <div className="bg-accent" style={{ width: `${(1 - prediction.bttsYesProb) * 100}%` }} />
            </div>
          </section>

          {/* Asian Handicap */}
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Asian Handicap
            </h3>
            <div className="space-y-3">
              {ahLines.map(([line, probs]) => (
                <div key={line} className="flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {parseFloat(line) >= 0 ? "+" : ""}{line}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-brand-strong">
                      H {(probs.home * 100).toFixed(0)}%
                    </span>
                    <span className="font-mono text-accent">
                      A {(probs.away * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
