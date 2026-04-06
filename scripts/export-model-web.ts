#!/usr/bin/env npx tsx
/**
 * Export Python model outputs to web-ready JSON for the analytics UI.
 *
 * Reads: nwsl-model/data/processed/predictions.csv, team_ratings.csv
 * Writes: nwsl-model/data/processed/web/predictions.json, team-ratings.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const PROCESSED = join(ROOT, "nwsl-model", "data", "processed");
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
const ratings = parseCsv(join(PROCESSED, "models", "team_ratings.csv"));

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

console.log("\nDone! Model web data written to nwsl-model/data/processed/web/");

// ── Helpers ────────────────────────────────────────────────────────────────

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
