/**
 * Bridge between the Python betting model's JSON output and the TypeScript
 * projection engine.
 *
 * Responsibilities:
 * - Read and parse JSON prediction files emitted by `scripts/predict.py`.
 * - Validate the structure against expected schemas.
 * - Cache parsed results in memory with a configurable TTL.
 * - Provide sensible fallback projections when model data is unavailable.
 */

import { readFile } from "fs/promises";
import path from "path";
import type {
  MatchProjection,
  ProjectionSummary,
  RawModelOutput,
} from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default directory where the Python model writes prediction JSON files. */
const DEFAULT_MODEL_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "nwsl-model",
  "data",
  "processed",
  "predictions"
);

/** Default cache TTL in milliseconds (15 minutes). */
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

/** Default over/under line to report when multiple lines are available. */
const DEFAULT_OVER_UNDER_LINE = 2.5;

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class ProjectionCache {
  private store = new Map<string, CacheEntry<MatchProjection[]>>();
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(key: string): MatchProjection[] | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: MatchProjection[]): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.store.clear();
  }
}

const cache = new ProjectionCache();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a raw model output object has the required fields and
 * reasonable value ranges. Returns an array of validation error messages
 * (empty if valid).
 */
export function validateRawModelOutput(raw: unknown): string[] {
  const errors: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    return ["Model output must be a non-null object"];
  }

  const obj = raw as Record<string, unknown>;

  // Required string fields.
  for (const field of ["match_id", "home_team", "away_team"]) {
    if (typeof obj[field] !== "string" || (obj[field] as string).length === 0) {
      errors.push(`Missing or invalid string field: ${field}`);
    }
  }

  // Required numeric probability fields (must be 0-1).
  for (const field of ["home_prob", "draw_prob", "away_prob"]) {
    const val = obj[field];
    if (typeof val !== "number" || val < 0 || val > 1) {
      errors.push(`${field} must be a number between 0 and 1, got ${val}`);
    }
  }

  // 1X2 probabilities should sum to approximately 1.
  const probSum =
    (obj.home_prob as number) +
    (obj.draw_prob as number) +
    (obj.away_prob as number);
  if (typeof probSum === "number" && Math.abs(probSum - 1) > 0.05) {
    errors.push(
      `1X2 probabilities sum to ${probSum.toFixed(4)}, expected ~1.0`
    );
  }

  // Expected goals should be non-negative.
  for (const field of ["expected_home_goals", "expected_away_goals"]) {
    const val = obj[field];
    if (typeof val !== "number" || val < 0) {
      errors.push(`${field} must be a non-negative number, got ${val}`);
    }
  }

  // BTTS probability.
  const btts = obj.btts_yes_prob;
  if (typeof btts !== "number" || btts < 0 || btts > 1) {
    errors.push(
      `btts_yes_prob must be a number between 0 and 1, got ${btts}`
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Convert a validated raw model output record into a `MatchProjection`.
 */
function rawToMatchProjection(
  raw: RawModelOutput,
  line: number = DEFAULT_OVER_UNDER_LINE
): MatchProjection {
  const overKey = String(line);
  const overPercent =
    raw.over_probs && overKey in raw.over_probs
      ? raw.over_probs[overKey] * 100
      : 50;

  return {
    fixtureId: raw.match_id,
    homeClubId: raw.home_team,
    awayClubId: raw.away_team,
    homeWinProbability: raw.home_prob,
    drawProbability: raw.draw_prob,
    awayWinProbability: raw.away_prob,
    expectedHomeGoals: raw.expected_home_goals,
    expectedAwayGoals: raw.expected_away_goals,
    bttsPercent: raw.btts_yes_prob * 100,
    overUnderLine: line,
    overPercent,
    updatedAt: raw.generated_at ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/**
 * Read a JSON predictions file produced by the Python model and return
 * parsed `MatchProjection` objects.
 *
 * The file is expected to contain either:
 * - A JSON array of `RawModelOutput` objects, or
 * - A single `RawModelOutput` object (wrapped in an array internally).
 *
 * Invalid records are skipped with a warning logged to the console.
 */
export async function readModelOutputFile(
  filePath: string
): Promise<MatchProjection[]> {
  const content = await readFile(filePath, "utf-8");
  const parsed: unknown = JSON.parse(content);

  const rawRecords: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const projections: MatchProjection[] = [];

  for (const record of rawRecords) {
    const errors = validateRawModelOutput(record);
    if (errors.length > 0) {
      console.warn(
        `[model-bridge] Skipping invalid record: ${errors.join("; ")}`
      );
      continue;
    }
    projections.push(rawToMatchProjection(record as RawModelOutput));
  }

  return projections;
}

/**
 * Load all prediction files from the model output directory, using the
 * in-memory cache when available.
 *
 * Looks for files matching `predictions*.json` in the output directory.
 */
export async function loadProjections(
  outputDir: string = DEFAULT_MODEL_OUTPUT_DIR
): Promise<MatchProjection[]> {
  // Check cache first.
  const cached = cache.get(outputDir);
  if (cached) return cached;

  let projections: MatchProjection[] = [];

  try {
    // Dynamic import to avoid bundling fs in client builds.
    const { readdir } = await import("fs/promises");
    const files = await readdir(outputDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith(".json") && f.startsWith("predictions")
    );

    for (const file of jsonFiles) {
      const filePath = path.join(outputDir, file);
      const fileProjections = await readModelOutputFile(filePath);
      projections = projections.concat(fileProjections);
    }
  } catch (err) {
    console.warn(
      `[model-bridge] Could not read model output directory (${outputDir}): ${err}`
    );
    // Return empty projections; callers should use fallbacks.
  }

  // De-duplicate by fixtureId, keeping the latest.
  const byFixture = new Map<string, MatchProjection>();
  for (const p of projections) {
    const existing = byFixture.get(p.fixtureId);
    if (!existing || p.updatedAt > existing.updatedAt) {
      byFixture.set(p.fixtureId, p);
    }
  }
  projections = [...byFixture.values()];

  cache.set(outputDir, projections);
  return projections;
}

// ---------------------------------------------------------------------------
// Fallback projections
// ---------------------------------------------------------------------------

/**
 * Generate a league-average fallback match projection when model data is
 * not available. Uses NWSL historical averages (~1.3 goals per team per game).
 */
export function createFallbackMatchProjection(
  fixtureId: string,
  homeClubId: string,
  awayClubId: string
): MatchProjection {
  // NWSL historical averages with slight home advantage.
  const expectedHomeGoals = 1.35;
  const expectedAwayGoals = 1.15;

  // Rough 1X2 from Poisson independence assumption.
  const homeWin = 0.42;
  const draw = 0.25;
  const awayWin = 0.33;

  return {
    fixtureId,
    homeClubId,
    awayClubId,
    homeWinProbability: homeWin,
    drawProbability: draw,
    awayWinProbability: awayWin,
    expectedHomeGoals,
    expectedAwayGoals,
    bttsPercent: 55,
    overUnderLine: 2.5,
    overPercent: 52,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// High-level summary builder
// ---------------------------------------------------------------------------

/**
 * Build a `ProjectionSummary` by loading model data and optionally
 * generating player projections. Player projections are left empty here;
 * callers should use `generatePlayerProjection` from the projection engine
 * to populate them.
 */
export async function buildProjectionSummary(
  outputDir?: string
): Promise<ProjectionSummary> {
  const matchProjections = await loadProjections(outputDir);

  return {
    matchProjections,
    playerProjections: [],
    modelVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Force-clear the projection cache. Useful after a new model run or in
 * tests.
 */
export function clearProjectionCache(): void {
  cache.clear();
}
