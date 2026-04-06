#!/usr/bin/env npx tsx
/**
 * Generate matches.csv for the Python NWSL prediction model from ESPN data.
 *
 * Usage: npx tsx scripts/generate-model-input.ts
 *
 * Reads from src/data/espn/matches-*.json and match-details.json
 * Writes to nwsl-model/data/raw/matches.csv
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const ESPN_DIR = join(ROOT, "src", "data", "espn");
const OUTPUT = join(ROOT, "nwsl-model", "data", "raw", "matches.csv");

interface EspnMatch {
  matchId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  status: string;
  venue: string;
}

interface MatchDetail {
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homePossession: number;
  awayPossession: number;
  homeCorners: number;
  awayCorners: number;
  homeFouls: number;
  awayFouls: number;
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(ESPN_DIR, filename), "utf-8"));
}

const matches2025 = loadJson<EspnMatch[]>("matches-2025.json");
const matches2026 = loadJson<EspnMatch[]>("matches-2026.json");
const details = loadJson<Record<string, MatchDetail>>("match-details.json");

// Merge 2025 details if available
let details2025: Record<string, MatchDetail> = {};
try {
  details2025 = loadJson<Record<string, MatchDetail>>("match-details-2025.json");
} catch {
  // File might not exist yet
}

const allDetails = { ...details, ...details2025 };

// CSV header matching the schema in nwsl-model/src/data/schemas.py
const header = [
  "match_id",
  "match_date",
  "season",
  "competition",
  "regular_season_flag",
  "home_team",
  "away_team",
  "home_goals_90",
  "away_goals_90",
  "venue",
  "match_status",
].join(",");

function matchToRow(m: EspnMatch, season: number): string {
  const cols = [
    m.matchId,
    m.date,
    season,
    "NWSL",
    "true",
    `"${m.homeTeam}"`,
    `"${m.awayTeam}"`,
    m.homeGoals,
    m.awayGoals,
    `"${m.venue}"`,
    m.status === "completed" ? "completed" : "scheduled",
  ];
  return cols.join(",");
}

const rows = [
  header,
  ...matches2025
    .filter((m) => m.status === "completed")
    .map((m) => matchToRow(m, 2025)),
  ...matches2026
    .filter((m) => m.status === "completed")
    .map((m) => matchToRow(m, 2026)),
];

writeFileSync(OUTPUT, rows.join("\n") + "\n");
console.log(`Wrote ${rows.length - 1} matches to ${OUTPUT}`);
