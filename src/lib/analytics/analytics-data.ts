/**
 * Analytics data layer.
 *
 * Returns REAL data only. No mock fallbacks — if data isn't available,
 * functions return empty results and the UI shows appropriate empty states.
 *
 * Data sources:
 * - Players & team stats: Real NWSL player pool (410 players, official 2025 stats)
 * - Predictions: Pre-computed JSON from Python model (when available)
 * - Matches: API-Football fixtures via Prisma (when connected)
 */

import type {
  MatchDetail,
  MatchPrediction,
  MatchResult,
  ModelPerformance,
  PlayerFormPoint,
  PlayerMatchLog,
  PlayerSeasonStats,
  TeamRating,
  TeamStanding,
  TeamStats,
} from "@/types/analytics";

import {
  getRealPlayerRankings,
  getRealPlayerById,
  getRealStandings,
  getRealTeamStats,
  getRealTeamRatings,
  getRealTeamById,
} from "@/lib/analytics/analytics-real-data";

import {
  loadModelPredictions,
  loadModelTeamRatings,
  loadModelPerformance,
} from "@/lib/analytics/model-data-loader";

// ── Team data (REAL — derived from 410 official NWSL player stats) ──────────

export function getLeagueTable(): TeamStanding[] {
  return getRealStandings();
}

export function getTeamStats(): TeamStats[] {
  return getRealTeamStats();
}

export function getTeamRatings(): TeamRating[] {
  const modelRatings = loadModelTeamRatings();
  if (modelRatings.length > 0) return modelRatings;
  return getRealTeamRatings();
}

export function getTeamDetail(teamId: string) {
  return getRealTeamById(teamId);
}

// ── Player data (REAL — 410 official NWSL players with 2025 season stats) ───

export function getPlayerRankings(): PlayerSeasonStats[] {
  return getRealPlayerRankings();
}

export function getPlayerDetail(playerId: string): PlayerSeasonStats | undefined {
  return getRealPlayerById(playerId);
}

/** Requires per-match data from API-Football. Returns empty until connected. */
export function getPlayerMatchLog(playerId: string): PlayerMatchLog[] {
  return [];
}

/** Requires per-match data from API-Football. Returns empty until connected. */
export function getPlayerForm(playerId: string): PlayerFormPoint[] {
  return [];
}

// ── Match data (requires API-Football fixtures — empty until connected) ─────

/** Returns empty until API-Football fixture sync is configured. */
export function getMatchResults(): MatchResult[] {
  return [];
}

/** Returns undefined until API-Football fixture sync is configured. */
export function getMatchDetail(matchId: string): MatchDetail | undefined {
  return undefined;
}

export function getUpcomingMatches(): MatchResult[] {
  return [];
}

export function getCompletedMatches(): MatchResult[] {
  return [];
}

// ── Model predictions (from Python pipeline — empty until model runs) ───────

export function getMatchPredictions(): MatchPrediction[] {
  return loadModelPredictions();
}

export function getMatchPrediction(matchId: string): MatchPrediction | undefined {
  const preds = loadModelPredictions();
  return preds.find((p) => p.matchId === matchId);
}

export function getModelPerformance(): ModelPerformance | null {
  return loadModelPerformance();
}
