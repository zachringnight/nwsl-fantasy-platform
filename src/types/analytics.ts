/**
 * Type definitions for the NWSL analytics section.
 * Covers team standings, player stats, match results, and model predictions.
 */

import type { PlayerPosition } from "@/types/fantasy";

export interface AnalyticsProvenance {
  season: "2025" | "2026";
  source: string;
  sourceUrl?: string;
  generatedAt: string;
  publishedAt?: string;
  checksum?: string;
  isLive: boolean;
  isStale: boolean;
}

// ── Team Analytics ──────────────────────────────────────────────────────────

export type FormResult = "W" | "D" | "L";

export interface TeamStanding {
  teamId: string;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: FormResult[];
  xg: number;
  xga: number;
}

export interface TeamStats {
  teamId: string;
  team: string;
  xg: number;
  xga: number;
  npxg: number;
  possession: number;
  shots: number;
  shotsOnTarget: number;
  passAccuracy: number;
  tackles: number;
  interceptions: number;
  cleanSheets: number;
  corners: number;
  passes?: number;
  successfulPasses?: number;
  crosses?: number;
  blocks?: number;
  yellowCards?: number;
  redCards?: number;
}

export interface TeamRating {
  teamId: string;
  team: string;
  overallRating: number;
  attackRating: number;
  defenseRating: number;
  homeAdvantage: number;
  trend: "up" | "down" | "stable";
  previousRank: number;
  currentRank: number;
}

// ── Player Analytics ────────────────────────────────────────────────────────

export interface PlayerSeasonStats {
  playerId: string;
  name: string;
  team: string;
  teamId: string;
  position: PlayerPosition;
  appearances: number;
  starts?: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  shots: number;
  shotsOnTarget: number;
  passAccuracy: number;
  tackles: number;
  interceptions: number;
  cleanSheets: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  fantasyPoints: number;
  pointsPer90: number;
  /** Appearances represented by the available match-by-match stat rows. */
  matchStatsAppearances?: number;
  /** Whether match-by-match stat rows cover every official season appearance. */
  matchStatsComplete?: boolean;
  photoUrl?: string;
  chancesCreated?: number;
  passes?: number;
  successfulPasses?: number;
  crosses?: number;
  foulsWon?: number;
  foulsCommitted?: number;
  blocks?: number;
  goalsConceded?: number;
  penaltySaves?: number;
  officialPlayerId?: string;
}

export interface PlayerMatchLog {
  matchId: string;
  officialMatchId?: string;
  date: string;
  opponent: string;
  opponentId?: string;
  teamId?: string;
  home: boolean;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  successfulPasses?: number;
  passAccuracy: number;
  tackles: number;
  interceptions: number;
  saves: number;
  chancesCreated?: number;
  crosses?: number;
  foulsWon?: number;
  foulsCommitted?: number;
  blocks?: number;
  cleanSheet?: boolean;
  goalsConceded?: number;
  yellowCards?: number;
  redCards?: number;
  penaltySaves?: number;
  penaltyMisses?: number;
  goalkeeperWin?: boolean;
  goalkeeperDraw?: boolean;
  fantasyPoints: number;
  fantasyBreakdown?: Record<string, number>;
}

export interface PlayerFormPoint {
  matchday: number;
  date: string;
  fantasyPoints: number;
  opponent: string;
}

// ── Match Analytics ─────────────────────────────────────────────────────────

export interface MatchResult {
  matchId: string;
  officialMatchId?: string;
  date: string;
  matchday: number;
  homeTeam: string;
  homeTeamId: string;
  awayTeam: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  venue: string;
  status: "completed" | "upcoming" | "live" | "postponed" | "canceled";
}

export interface MatchDetail extends MatchResult {
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
  events: MatchEvent[];
}

export interface MatchEvent {
  minute: number;
  type: "goal" | "assist" | "yellow_card" | "red_card" | "substitution";
  team: string;
  playerName: string;
  detail?: string;
}

// ── Model Predictions ───────────────────────────────────────────────────────

export interface MatchPrediction {
  matchId: string;
  date: string;
  homeTeam: string;
  homeTeamId: string;
  awayTeam: string;
  awayTeamId: string;
  homeProb: number;
  drawProb: number;
  awayProb: number;
  bttsYesProb: number;
  overUnder: Record<string, { over: number; under: number }>;
  asianHandicap: Record<string, { home: number; away: number }>;
  lambdaHome: number;
  lambdaAway: number;
  scoreMatrix: number[][];
  model: string;
  timestamp: string;
  modelVersion?: string;
  modelFamily?: string;
  trainingCutoff?: string;
  sourceManifestGeneratedAt?: string;
  gatingStatus?: string;
  featureStatus?: "complete" | "partial" | "unknown";
  topPickTier?: "official_pick" | "lean" | "no_bet" | string;
  officialPickCount?: number;
  leanBetCount?: number;
  actionablePickCount?: number;
  recommendedBets?: string;
  recommendedLeans?: string;
  actionablePicks?: string;
  rejectedBetReasons?: string;
  marketOdds?: MatchMarketOdds;
  pickSummary?: MatchPickSummary;
  dataSource?: "supabase" | "static_fallback";
  isStale?: boolean;
}

export interface MatchMarketOdds {
  hasMarketOdds: boolean;
  marketIsFresh: boolean;
  sportsbook?: string;
  marketType?: string;
  marketTypes?: string;
  timestamp?: string;
  ageMinutes?: number;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  totalLine?: number;
  overOdds?: number;
  underOdds?: number;
}

export interface MatchPickSummary {
  tier: "official_pick" | "lean" | "no_bet" | string;
  actionable: boolean;
  accepted: boolean;
  reason: string;
  officialPickCount: number;
  leanBetCount: number;
  actionablePickCount: number;
  recommendedBets: string;
  recommendedLeans: string;
  actionablePicks: string;
  rejectedBetReasons: string;
}

export interface ModelPerformance {
  model: string;
  logLoss: number;
  brierScore: number;
  calibrationError: number;
  roi: number;
  hitRate: number;
  totalPredictions: number;
  calibrationBuckets: Array<{
    predicted: number;
    actual: number;
    count: number;
  }>;
}

// ── Sort/Filter ─────────────────────────────────────────────────────────────

export type PlayerSortKey =
  | "fantasyPoints"
  | "goals"
  | "assists"
  | "xg"
  | "xa"
  | "pointsPer90"
  | "minutes"
  | "appearances";

export type TeamSortKey =
  | "points"
  | "goalDifference"
  | "goalsFor"
  | "xg"
  | "xga";
