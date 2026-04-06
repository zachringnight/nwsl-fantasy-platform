/**
 * Analytics data layer.
 *
 * Returns REAL data only. No mock fallbacks.
 *
 * Data sources:
 * - Players: 410 official NWSL players with 2025 season stats
 * - Standings: ESPN 2025/2026 real standings
 * - Matches: ESPN real match results (2025 + 2026 seasons)
 * - Predictions: Pre-computed JSON from Python model (when available)
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
  getRealMatchResults,
} from "@/lib/analytics/analytics-real-data";

import {
  loadModelPredictions,
  loadModelTeamRatings,
  loadModelPerformance,
} from "@/lib/analytics/model-data-loader";

// ── Team data (real ESPN standings + aggregated player stats) ───────────────

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

// ── Player data (410 official NWSL players with 2025 season stats) ─────────

export function getPlayerRankings(): PlayerSeasonStats[] {
  return getRealPlayerRankings();
}

export function getPlayerDetail(playerId: string): PlayerSeasonStats | undefined {
  return getRealPlayerById(playerId);
}

/** Per-match data requires API-Football. Returns empty until configured. */
export function getPlayerMatchLog(playerId: string): PlayerMatchLog[] {
  return [];
}

/** Per-match data requires API-Football. Returns empty until configured. */
export function getPlayerForm(playerId: string): PlayerFormPoint[] {
  return [];
}

// ── Match data (real ESPN results) ─────────────────────────────────────────

export function getMatchResults(): MatchResult[] {
  return getRealMatchResults();
}

/** Detailed match stats require API-Football. Returns basic data from ESPN. */
export function getMatchDetail(matchId: string): MatchDetail | undefined {
  const match = getRealMatchResults().find((m) => m.matchId === matchId);
  if (!match) return undefined;

  // We have the core result from ESPN but not detailed stats
  return {
    ...match,
    homeShots: 0,
    awayShots: 0,
    homeShotsOnTarget: 0,
    awayShotsOnTarget: 0,
    homePossession: 0,
    awayPossession: 0,
    homeCorners: 0,
    awayCorners: 0,
    homeFouls: 0,
    awayFouls: 0,
    events: [],
  };
}

export function getUpcomingMatches(): MatchResult[] {
  return getRealMatchResults().filter((m) => m.status === "upcoming");
}

export function getCompletedMatches(): MatchResult[] {
  return getRealMatchResults().filter((m) => m.status === "completed");
}

// ── Model predictions (from Python pipeline — empty until model runs) ──────

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
