#!/usr/bin/env npx tsx
/**
 * Export Python model outputs to web-ready JSON for the analytics UI.
 *
 * Reads: nwsl-model/data/processed/predictions.csv, team_ratings.csv
 * Writes: nwsl-model/data/processed/web/predictions.json, team-ratings.json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveEvaluatedMatchCount } from "../src/lib/model-export-utils";

const ROOT = process.cwd();
const PROCESSED = join(ROOT, "nwsl-model", "data", "processed");
const MODELS_DIR = join(PROCESSED, "models");
const WEB_DIR = join(PROCESSED, "web");
mkdirSync(WEB_DIR, { recursive: true });

function parseCsv(filepath: string): Record<string, string>[] {
  const text = readFileSync(filepath, "utf-8").trim();
  const [headerLine, ...dataLines] = text.split("\n");
  const headers = headerLine.split(",");
  return dataLines.map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").replace(/^"|"$/g, "");
    });
    return row;
  });
}

// ── Predictions ────────────────────────────────────────────────────────────

console.log("Exporting predictions...");
const predictions = parseCsv(join(PROCESSED, "predictions.csv"));
const predictionVersion = predictions.find((r) => r.model_version)?.model_version;
const artifactDir = resolveArtifactDir(predictionVersion);

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const webPredictions = predictions.map((r) => ({
  matchId: r.match_id,
  date: r.match_date,
  homeTeam: r.home_team,
  homeTeamId: slugify(r.home_team),
  awayTeam: r.away_team,
  awayTeamId: slugify(r.away_team),
  homeProb: parseFloat(r.prob_home) || 0,
  drawProb: parseFloat(r.prob_draw) || 0,
  awayProb: parseFloat(r.prob_away) || 0,
  bttsYesProb: parseFloat(r.btts_yes_prob) || 0,
  lambdaHome: parseFloat(r.lambda_home) || 0,
  lambdaAway: parseFloat(r.lambda_away) || 0,
  overUnder: {
    "1.5": {
      over: parseFloat(r["prob_over_1.5"]) || 0,
      under: parseFloat(r["prob_under_1.5"]) || 0,
    },
    "2.5": {
      over: parseFloat(r["prob_over_2.5"]) || 0,
      under: parseFloat(r["prob_under_2.5"]) || 0,
    },
    "3.5": {
      over: parseFloat(r["prob_over_3.5"]) || 0,
      under: parseFloat(r["prob_under_3.5"]) || 0,
    },
    "4.5": {
      over: parseFloat(r["prob_over_4.5"]) || 0,
      under: parseFloat(r["prob_under_4.5"]) || 0,
    },
  },
  asianHandicap: {
    "-0.5": {
      home: parseFloat(r["ah_home_-0.5"]) || 0,
      away: parseFloat(r["ah_away_-0.5"]) || 0,
    },
    "-1.0": {
      home: parseFloat(r["ah_home_-1.0"]) || 0,
      away: parseFloat(r["ah_away_-1.0"]) || 0,
    },
    "0.5": {
      home: parseFloat(r["ah_home_0.5"]) || 0,
      away: parseFloat(r["ah_away_0.5"]) || 0,
    },
    "1.0": {
      home: parseFloat(r["ah_home_1.0"]) || 0,
      away: parseFloat(r["ah_away_1.0"]) || 0,
    },
  },
  scoreMatrix: generateScoreMatrix(
    parseFloat(r.lambda_home) || 1,
    parseFloat(r.lambda_away) || 1
  ),
  model: r.model || "dixon_coles",
  timestamp: r.timestamp || new Date().toISOString(),
}));

writeFileSync(join(WEB_DIR, "predictions.json"), JSON.stringify(webPredictions, null, 2));
console.log(`  → ${webPredictions.length} predictions`);

// ── Team Ratings ───────────────────────────────────────────────────────────

console.log("Exporting team ratings...");
const ratingsPath = artifactDir
  ? join(artifactDir, "team_ratings.csv")
  : join(MODELS_DIR, "team_ratings.csv");
const ratings = existsSync(ratingsPath) ? parseCsv(ratingsPath) : [];

const webRatings = ratings
  .map((r) => {
    const attack = parseFloat(r.attack_rating) || 0;
    const defense = parseFloat(r.defense_rating) || 0;
    // Normalize to 0-100 scale for display
    const attackNorm = Math.min(95, Math.max(20, 50 + attack * 30));
    const defenseNorm = Math.min(95, Math.max(20, 50 + defense * 30));
    return {
      teamId: slugify(r.team),
      team: r.team,
      overallRating: Math.round(((attackNorm + defenseNorm) / 2) * 10) / 10,
      attackRating: Math.round(attackNorm * 10) / 10,
      defenseRating: Math.round(defenseNorm * 10) / 10,
      homeAdvantage: 0.35, // from model fit
      trend: "stable" as const,
      previousRank: 0,
      currentRank: 0,
    };
  })
  .sort((a, b) => b.overallRating - a.overallRating)
  .map((r, i) => ({ ...r, currentRank: i + 1, previousRank: i + 1 }));

writeFileSync(join(WEB_DIR, "team-ratings.json"), JSON.stringify(webRatings, null, 2));
console.log(`  → ${webRatings.length} team ratings`);

// ── Backtest Summary ───────────────────────────────────────────────────────

console.log("Exporting backtest summary...");
const metricsPath = artifactDir ? join(artifactDir, "backtest", "metrics_comparison.csv") : "";
const metrics = metricsPath && existsSync(metricsPath) ? parseCsv(metricsPath) : [];
const backtestSummary = Object.fromEntries(
  metrics.map((r) => {
    const modelName = r.model || "unknown";
    const explicitCount = parseInt(r.n_predictions || r.n_matches || "0", 10) || 0;
    const predictionRowsPath = artifactDir
      ? join(artifactDir, "backtest", `predictions_${modelName}.csv`)
      : "";
    const evaluatedMatches = resolveEvaluatedMatchCount(
      explicitCount,
      predictionRowsPath && existsSync(predictionRowsPath)
        ? readFileSync(predictionRowsPath, "utf-8")
        : undefined
    );

    return [
      modelName,
      {
        logLoss: round4(parseFloat(r.log_loss_1x2) || 0),
        brierScore: round4(parseFloat(r.brier_score_1x2) || 0),
        calibrationError: round4(parseFloat(r.calibration_error) || 0),
        roi: round4(parseFloat(r.roi) || 0),
        hitRate: round4(parseFloat(r.hit_rate) || 0),
        totalPredictions: evaluatedMatches,
        brierOver25: round4(parseFloat(r.brier_over_2_5) || 0),
        totalGoalsMae: round4(parseFloat(r.expected_total_goals_mae) || 0),
      },
    ];
  })
);

writeFileSync(join(WEB_DIR, "backtest-summary.json"), JSON.stringify(backtestSummary, null, 2));
console.log(`  → ${Object.keys(backtestSummary).length} model summaries`);

console.log("\nDone! Model web data written to nwsl-model/data/processed/web/");

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveArtifactDir(modelVersion?: string): string | null {
  if (modelVersion) {
    const versionDir = join(MODELS_DIR, modelVersion);
    if (existsSync(join(versionDir, "training_summary.json"))) return versionDir;
  }

  if (!existsSync(MODELS_DIR)) return null;
  const candidates = readdirSync(MODELS_DIR)
    .map((name) => join(MODELS_DIR, name))
    .filter((path) => existsSync(join(path, "training_summary.json")))
    .sort((a, b) => {
      const mtimeDelta = statSync(b).mtimeMs - statSync(a).mtimeMs;
      return mtimeDelta !== 0 ? mtimeDelta : b.localeCompare(a);
    });
  return candidates[0] ?? null;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function generateScoreMatrix(lambdaHome: number, lambdaAway: number): number[][] {
  const size = 9;
  const matrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    const row: number[] = [];
    for (let j = 0; j < size; j++) {
      row.push(
        Math.round(poissonPmf(lambdaHome, i) * poissonPmf(lambdaAway, j) * 10000) / 10000
      );
    }
    matrix.push(row);
  }
  return matrix;
}

function poissonPmf(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
