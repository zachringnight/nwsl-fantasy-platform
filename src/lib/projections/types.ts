/**
 * TypeScript types for the betting model projection data.
 *
 * These types bridge the Python NWSL betting model (Dixon-Coles / Bivariate
 * Poisson score-matrix outputs) with the fantasy scoring engine, providing
 * match-level and player-level projections that drive the fantasy platform.
 */

import type { PlayerPosition } from "@/types/fantasy";

// ---------------------------------------------------------------------------
// Match-level projections (derived from the score matrix)
// ---------------------------------------------------------------------------

export interface MatchProjection {
  /** Internal fixture identifier. */
  fixtureId: string;
  /** Home club identifier. */
  homeClubId: string;
  /** Away club identifier. */
  awayClubId: string;

  /** P(home win) derived from score matrix. */
  homeWinProbability: number;
  /** P(draw) derived from score matrix. */
  drawProbability: number;
  /** P(away win) derived from score matrix. */
  awayWinProbability: number;

  /** Lambda (expected goals) for the home side. */
  expectedHomeGoals: number;
  /** Lambda (expected goals) for the away side. */
  expectedAwayGoals: number;

  /** P(both teams to score) as a percentage 0-100. */
  bttsPercent: number;

  /** The over/under line the model is pricing (e.g. 2.5). */
  overUnderLine: number;
  /** P(over) for the given line, as a percentage 0-100. */
  overPercent: number;

  /** ISO-8601 timestamp of last model update. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Player-level projections (fantasy-relevant)
// ---------------------------------------------------------------------------

export interface PlayerProjection {
  /** Platform player identifier. */
  playerId: string;
  /** Fixture this projection pertains to. */
  fixtureId: string;

  /** Projected total fantasy points for this fixture. */
  projectedPoints: number;
  /** Projected minutes the player will play. */
  projectedMinutes: number;
  /** Projected goals scored by the player. */
  projectedGoals: number;
  /** Projected assists by the player. */
  projectedAssists: number;
  /** Clean sheet probability (0-1) for the player's team. */
  projectedCleanSheet: number;
  /** Projected saves (GK only, 0 for outfield). */
  projectedSaves: number;

  /** Model confidence band for the projection. */
  confidence: "high" | "medium" | "low";
  /** ISO-8601 timestamp of last model update. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Container returned by the projections API
// ---------------------------------------------------------------------------

export interface ProjectionSummary {
  matchProjections: MatchProjection[];
  playerProjections: PlayerProjection[];
  /** Semver string identifying the model artifact version. */
  modelVersion: string;
  /** ISO-8601 timestamp when projections were generated. */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Internal types used by the projection engine
// ---------------------------------------------------------------------------

/** Minimal player descriptor needed for projection generation. */
export interface ProjectionPlayerInput {
  playerId: string;
  position: PlayerPosition;
  clubId: string;
  /** Expected minutes (0-90). When omitted the engine assumes 90. */
  expectedMinutes?: number;
  /** Historical goals-per-90 rate; used to weight within position group. */
  goalsPer90?: number;
  /** Historical assists-per-90 rate. */
  assistsPer90?: number;
  /** Historical saves-per-90 rate (GK only). */
  savesPer90?: number;
}

/** Position-level weighting for distributing expected team goals. */
export interface PositionGoalWeights {
  GK: number;
  DEF: number;
  MID: number;
  FWD: number;
}

/**
 * Raw model output as serialised to JSON by the Python prediction script.
 *
 * This mirrors the fields the Python `MarketPrices` dataclass writes when
 * dumped to JSON via `scripts/predict.py`.
 */
export interface RawModelOutput {
  match_id: string;
  home_team: string;
  away_team: string;
  home_prob: number;
  draw_prob: number;
  away_prob: number;
  expected_home_goals: number;
  expected_away_goals: number;
  btts_yes_prob: number;
  over_probs: Record<string, number>;
  under_probs: Record<string, number>;
  model_version?: string;
  generated_at?: string;
}
