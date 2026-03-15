/**
 * Projection engine: converts match-level betting model outputs into
 * player-level fantasy point projections.
 *
 * The engine uses a Poisson-based approach to translate expected team goals
 * into individual player projections, weighted by position and historical
 * per-90 rates. These projections are then scored using the platform's
 * existing fantasy scoring engine.
 */

import type { PlayerPosition } from "@/types/fantasy";
import type { FantasyScoringRules } from "@/lib/scoring/scoring-rules";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import { calculateFantasyScore } from "@/lib/scoring/scoring-engine";
import type {
  MatchProjection,
  PlayerProjection,
  ProjectionPlayerInput,
  PositionGoalWeights,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default position weights for distributing a team's expected goals across
 * the squad. Roughly: FWD 40%, MID 35%, DEF 20%, GK 5%.
 */
export const DEFAULT_POSITION_GOAL_WEIGHTS: PositionGoalWeights = {
  FWD: 0.4,
  MID: 0.35,
  DEF: 0.2,
  GK: 0.05,
};

/** Default assist-to-goal ratio per position (assists generated per goal). */
const ASSIST_RATIO_BY_POSITION: Record<PlayerPosition, number> = {
  FWD: 0.35,
  MID: 0.55,
  DEF: 0.25,
  GK: 0.05,
};

/** Average saves per 90 for a starting GK when the other side's xG is ~1.0. */
const BASE_SAVES_PER_XG = 3.0;

// ---------------------------------------------------------------------------
// Poisson helpers
// ---------------------------------------------------------------------------

/**
 * Compute P(X = 0) for a Poisson random variable with rate `lambda`.
 *
 * This is used to estimate clean-sheet probability from expected goals
 * against: if the opponent's expected goals are `lambda`, the probability
 * that they score exactly 0 goals is e^(-lambda).
 */
export function estimateCleanSheetProbability(
  expectedGoalsConceded: number
): number {
  if (expectedGoalsConceded < 0) {
    return 1;
  }
  return Math.exp(-expectedGoalsConceded);
}

/**
 * Compute P(X = k) for a Poisson random variable with rate `lambda`.
 */
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logProb = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) {
    logProb -= Math.log(i);
  }
  return Math.exp(logProb);
}

// ---------------------------------------------------------------------------
// Goal distribution
// ---------------------------------------------------------------------------

/**
 * Distribute a team's expected goals across the players in the squad,
 * weighted by position and (optionally) individual historical scoring rates.
 *
 * Algorithm:
 * 1. Group players by position.
 * 2. Allocate the position-level share of expected goals to each group.
 * 3. Within a position group, split equally unless `goalsPer90` rates are
 *    provided, in which case weight proportionally.
 *
 * Returns a map from playerId to their projected individual goals.
 */
export function distributeExpectedGoals(
  expectedTeamGoals: number,
  players: ProjectionPlayerInput[],
  weights: PositionGoalWeights = DEFAULT_POSITION_GOAL_WEIGHTS
): Map<string, number> {
  const result = new Map<string, number>();

  if (players.length === 0 || expectedTeamGoals <= 0) {
    for (const p of players) {
      result.set(p.playerId, 0);
    }
    return result;
  }

  // Group players by position.
  const groups = new Map<PlayerPosition, ProjectionPlayerInput[]>();
  for (const p of players) {
    const list = groups.get(p.position) ?? [];
    list.push(p);
    groups.set(p.position, list);
  }

  // Determine which position groups are actually represented and re-normalise
  // the weights so they sum to 1 across occupied positions.
  const occupiedPositions = [...groups.keys()];
  const rawWeightSum = occupiedPositions.reduce(
    (sum, pos) => sum + weights[pos],
    0
  );

  for (const [position, groupPlayers] of groups) {
    const positionShare =
      rawWeightSum > 0
        ? (weights[position] / rawWeightSum) * expectedTeamGoals
        : expectedTeamGoals / occupiedPositions.length;

    // Weight within the group by goalsPer90, falling back to equal split.
    const rates = groupPlayers.map((p) => p.goalsPer90 ?? 0);
    const rateSum = rates.reduce((a, b) => a + b, 0);

    for (let i = 0; i < groupPlayers.length; i++) {
      const player = groupPlayers[i];
      // Adjust for expected minutes (proportion of 90).
      const minutesFraction = (player.expectedMinutes ?? 90) / 90;

      let playerShare: number;
      if (rateSum > 0) {
        playerShare =
          positionShare * (rates[i] / rateSum) * minutesFraction;
      } else {
        playerShare =
          (positionShare / groupPlayers.length) * minutesFraction;
      }

      result.set(player.playerId, playerShare);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Projected fantasy points
// ---------------------------------------------------------------------------

/**
 * Convert projected per-match stats into a fantasy point total using the
 * platform's scoring engine.
 *
 * This is a thin wrapper that maps a `PlayerProjection` into the
 * `StatLineInput` expected by `calculateFantasyScore`.
 */
export function calculateProjectedFantasyPoints(
  projection: PlayerProjection,
  position: PlayerPosition,
  scoringRules: FantasyScoringRules = launchScoringRules
): number {
  const minutes = projection.projectedMinutes;
  const isCleanSheet =
    projection.projectedCleanSheet >= 0.5 && minutes >= 60;

  const result = calculateFantasyScore(
    {
      position,
      minutes,
      goals: projection.projectedGoals,
      assists: projection.projectedAssists,
      cleanSheet: isCleanSheet,
      saves: projection.projectedSaves,
      goalsConceded: isCleanSheet ? 0 : Math.round(1 / Math.max(projection.projectedCleanSheet, 0.01) - 1),
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    },
    scoringRules
  );

  return result.total;
}

/**
 * Compute expected (probabilistic) fantasy points by weighting each outcome
 * by its probability rather than using a binary clean-sheet threshold.
 *
 * This gives a smoother, more accurate projection than the threshold method.
 */
export function calculateExpectedFantasyPoints(
  projectedGoals: number,
  projectedAssists: number,
  projectedMinutes: number,
  projectedSaves: number,
  cleanSheetProbability: number,
  expectedGoalsConceded: number,
  position: PlayerPosition,
  scoringRules: FantasyScoringRules = launchScoringRules
): number {
  const played = projectedMinutes > 0;
  const over60 = projectedMinutes >= 60;

  // Base points: appearance + 60-min bonus.
  let points = 0;
  if (played) points += scoringRules.appearance;
  if (over60) points += scoringRules.minutes60Plus;

  // Goals and assists (use expected values directly).
  points += projectedGoals * scoringRules.goal[position];
  points += projectedAssists * scoringRules.assist;

  // Clean sheet: weight by probability (only awards if 60+ minutes).
  if (over60) {
    points += cleanSheetProbability * scoringRules.cleanSheet[position];
  }

  // Saves (GK only in practice, but rules handle zero for outfield).
  points += projectedSaves * scoringRules.save;

  // Goals conceded: expected value.
  points += expectedGoalsConceded * scoringRules.goalsConceded[position];

  return points;
}

// ---------------------------------------------------------------------------
// Full player projection generation
// ---------------------------------------------------------------------------

/**
 * Generate a full `PlayerProjection` for a single player given the match
 * projection and the player's profile.
 *
 * Steps:
 * 1. Use the match expected goals to derive the player's expected goals via
 *    position weighting.
 * 2. Estimate assists from the team's expected goals and the player's
 *    position assist ratio.
 * 3. Derive clean-sheet probability from the opponent's expected goals.
 * 4. Estimate saves from the opponent's expected goals (GK only).
 * 5. Score the projection via the fantasy scoring engine.
 */
export function generatePlayerProjection(
  matchProjection: MatchProjection,
  player: ProjectionPlayerInput,
  allTeamPlayers: ProjectionPlayerInput[],
  scoringRules: FantasyScoringRules = launchScoringRules
): PlayerProjection {
  const isHome = player.clubId === matchProjection.homeClubId;
  const teamXG = isHome
    ? matchProjection.expectedHomeGoals
    : matchProjection.expectedAwayGoals;
  const opponentXG = isHome
    ? matchProjection.expectedAwayGoals
    : matchProjection.expectedHomeGoals;

  // Filter to same-team players for goal distribution.
  const teammates = allTeamPlayers.filter((p) => p.clubId === player.clubId);

  // Distribute expected goals across the team.
  const goalDistribution = distributeExpectedGoals(teamXG, teammates);
  const projectedGoals = goalDistribution.get(player.playerId) ?? 0;

  // Estimate assists: use player-level rate if available, otherwise derive
  // from position ratio applied to team expected goals.
  const minutes = player.expectedMinutes ?? 90;
  const minutesFraction = minutes / 90;
  let projectedAssists: number;
  if (player.assistsPer90 != null && player.assistsPer90 > 0) {
    projectedAssists = player.assistsPer90 * minutesFraction;
  } else {
    // Each goal scored by the team has a ~70% chance of having an assist.
    // Distribute assists across the squad by position assist ratio.
    const teamAssists = teamXG * 0.7;
    const positionAssistShare = ASSIST_RATIO_BY_POSITION[player.position];
    const samePositionCount = teammates.filter(
      (t) => t.position === player.position
    ).length;
    projectedAssists =
      samePositionCount > 0
        ? (teamAssists * positionAssistShare * minutesFraction) /
          samePositionCount
        : 0;
  }

  // Clean sheet probability from opponent xG.
  const cleanSheetProb = estimateCleanSheetProbability(opponentXG);

  // Saves projection (GK only).
  let projectedSaves = 0;
  if (player.position === "GK") {
    if (player.savesPer90 != null && player.savesPer90 > 0) {
      projectedSaves = player.savesPer90 * minutesFraction;
    } else {
      projectedSaves = opponentXG * BASE_SAVES_PER_XG * minutesFraction;
    }
  }

  // Calculate expected fantasy points.
  const expectedGoalsConceded = opponentXG * minutesFraction;
  const projectedPoints = calculateExpectedFantasyPoints(
    projectedGoals,
    projectedAssists,
    minutes,
    projectedSaves,
    cleanSheetProb,
    expectedGoalsConceded,
    player.position,
    scoringRules
  );

  // Determine confidence from the match projection spread.
  const totalXG = teamXG + opponentXG;
  let confidence: "high" | "medium" | "low";
  if (minutes >= 75 && totalXG > 0.5) {
    confidence = "high";
  } else if (minutes >= 45) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    playerId: player.playerId,
    fixtureId: matchProjection.fixtureId,
    projectedPoints: Math.round(projectedPoints * 100) / 100,
    projectedMinutes: minutes,
    projectedGoals: Math.round(projectedGoals * 1000) / 1000,
    projectedAssists: Math.round(projectedAssists * 1000) / 1000,
    projectedCleanSheet: Math.round(cleanSheetProb * 1000) / 1000,
    projectedSaves: Math.round(projectedSaves * 100) / 100,
    confidence,
    updatedAt: matchProjection.updatedAt,
  };
}
