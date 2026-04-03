/**
 * Analytics data layer.
 *
 * Server-side functions that return analytics data.
 * Currently backed by mock data; designed to swap in API-Football / Prisma
 * and Python model JSON outputs without changing the interface.
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
  getMockStandings,
  getMockTeamStats,
  getMockTeamRatings,
  getMockPlayers,
  getMockPlayerById,
  getMockPlayerMatchLog,
  getMockPlayerForm,
  getMockMatches,
  getMockMatchDetail,
  getMockPredictions,
  getMockPredictionById,
  getMockModelPerformance,
  getMockTeamById,
} from "@/lib/analytics/analytics-mock-data";

// ── Team data ───────────────────────────────────────────────────────────────

export function getLeagueTable(): TeamStanding[] {
  return getMockStandings();
}

export function getTeamStats(): TeamStats[] {
  return getMockTeamStats();
}

export function getTeamRatings(): TeamRating[] {
  return getMockTeamRatings();
}

export function getTeamDetail(teamId: string) {
  return getMockTeamById(teamId);
}

// ── Player data ──────────────────────────────────────────���──────────────────

export function getPlayerRankings(): PlayerSeasonStats[] {
  return getMockPlayers();
}

export function getPlayerDetail(playerId: string): PlayerSeasonStats | undefined {
  return getMockPlayerById(playerId);
}

export function getPlayerMatchLog(playerId: string): PlayerMatchLog[] {
  return getMockPlayerMatchLog(playerId);
}

export function getPlayerForm(playerId: string): PlayerFormPoint[] {
  return getMockPlayerForm(playerId);
}

// ── Match data ──────────────────────────────────────────────────────────────

export function getMatchResults(): MatchResult[] {
  return getMockMatches();
}

export function getMatchDetail(matchId: string): MatchDetail | undefined {
  return getMockMatchDetail(matchId);
}

export function getUpcomingMatches(): MatchResult[] {
  return getMockMatches().filter((m) => m.status === "upcoming");
}

export function getCompletedMatches(): MatchResult[] {
  return getMockMatches().filter((m) => m.status === "completed");
}

// ── Model predictions ───────────────────────────────────────────────────────

export function getMatchPredictions(): MatchPrediction[] {
  return getMockPredictions();
}

export function getMatchPrediction(matchId: string): MatchPrediction | undefined {
  return getMockPredictionById(matchId);
}

export function getModelPerformance(): ModelPerformance {
  return getMockModelPerformance();
}
