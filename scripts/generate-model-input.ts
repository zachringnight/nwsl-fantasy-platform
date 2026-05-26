#!/usr/bin/env npx tsx
/**
 * Generate matches.csv for the Python NWSL prediction model from ESPN data.
 *
 * Usage: npx tsx scripts/generate-model-input.ts
 *
 * Reads from src/data/espn/matches-*.json and match-details.json
 * Writes to nwsl-model/data/raw/matches.csv
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildModelInputCsvs, type EspnModelMatch } from "../src/lib/model-input-builder";

const ROOT = process.cwd();
const ESPN_DIR = join(ROOT, "src", "data", "espn");
const RAW_DIR = join(ROOT, "nwsl-model", "data", "raw");
const MATCHES_OUTPUT = join(RAW_DIR, "matches.csv");
const UPCOMING_OUTPUT = join(RAW_DIR, "upcoming.csv");
const MANIFEST_OUTPUT = join(RAW_DIR, "dataset_manifest.json");

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(ESPN_DIR, filename), "utf-8"));
}

const matches2025 = loadJson<EspnModelMatch[]>("matches-2025.json");
const matches2026 = loadJson<EspnModelMatch[]>("matches-2026.json");
const output = buildModelInputCsvs(matches2025, matches2026);

mkdirSync(RAW_DIR, { recursive: true });
writeFileSync(MATCHES_OUTPUT, output.matchesCsv);
writeFileSync(UPCOMING_OUTPUT, output.upcomingCsv);
writeFileSync(
  MANIFEST_OUTPUT,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source: "espn_public_api",
      source_files: {
        matches_2025: "src/data/espn/matches-2025.json",
        matches_2026: "src/data/espn/matches-2026.json",
      },
      matches: {
        rows: output.completedCount,
        season_coverage: output.completedSeasonCoverage,
        date_range: output.completedDateRange,
        status: "completed_only",
      },
      upcoming: {
        rows: output.upcomingCount,
        season_coverage: output.upcomingSeasonCoverage,
        date_range: output.upcomingDateRange,
        status: "scheduled_only",
      },
      feature_policy: {
        training_window: "ESPN 2025-2026 public scoreboard",
        travel_features: "disabled",
        weather_features: "disabled",
        surface_features: "disabled",
        xg_features: "not_available_from_espn_feed",
      },
      odds: {
        rows: 0,
        source_available: false,
        markets: [],
      },
      missing_feature_coverage: {
        odds_missing_pct: 100.0,
        xg_missing_pct: 100.0,
      },
    },
    null,
    2
  ) + "\n"
);
console.log(`Wrote ${output.completedCount} completed matches to ${MATCHES_OUTPUT}`);
console.log(`Wrote ${output.upcomingCount} upcoming fixtures to ${UPCOMING_OUTPUT}`);
console.log(`Wrote dataset manifest to ${MANIFEST_OUTPUT}`);
