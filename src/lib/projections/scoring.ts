import type { PlayerProjectionRecord } from "@/lib/analytics/predictive";
import {
  calculateAggregateFantasyScore,
  type AggregateStatLineInput,
  type FantasyScoreResult,
} from "@/lib/scoring/scoring-engine";
import {
  launchScoringRules,
  type FantasyScoringRules,
} from "@/lib/scoring/scoring-rules";

export type FantasyProjectionSchemaKey = "site_launch_v1" | "dfs_soccer_v1";

export interface FantasyProjectionSchemaDefinition {
  key: FantasyProjectionSchemaKey;
  label: string;
  rules: FantasyScoringRules;
}

const dfsSoccerScoringRules: FantasyScoringRules = {
  appearance: 0.5,
  minutes60Plus: 0.5,
  goal: {
    GK: 10,
    DEF: 10,
    MID: 9,
    FWD: 8,
  },
  assist: 6,
  shot: 1,
  shotOnTarget: 1,
  chanceCreated: 1.25,
  successfulPass: 0.02,
  successfulCross: 0.75,
  foulWon: 0.5,
  foulCommitted: -0.5,
  tackleWon: 1,
  interception: 0.6,
  block: 1,
  cleanSheet: {
    GK: 5,
    DEF: 3,
    MID: 1,
    FWD: 0,
  },
  save: 2,
  goalsConceded: {
    GK: -1,
    DEF: -0.25,
    MID: 0,
    FWD: 0,
  },
  yellowCard: -1.5,
  redCard: -4,
  penaltySave: 3,
  penaltyMiss: -3,
  penaltyConceded: -1,
  ownGoal: -3,
  goalkeeperWin: 5,
  goalkeeperDraw: 2,
};

export const fantasyProjectionSchemas: Record<
  FantasyProjectionSchemaKey,
  FantasyProjectionSchemaDefinition
> = {
  site_launch_v1: {
    key: "site_launch_v1",
    label: "Site Launch v1",
    rules: launchScoringRules,
  },
  dfs_soccer_v1: {
    key: "dfs_soccer_v1",
    label: "DFS Soccer v1",
    rules: dfsSoccerScoringRules,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function estimateAppearanceProbability(player: PlayerProjectionRecord) {
  if (player.availability === "out" || player.lineupStatus === "Unavailable") {
    return 0;
  }

  const minutesSignal = clamp(player.expectedMinutes / 70, 0, 1);
  const lineupSignal = clamp(player.starterProbability * 0.9 + 0.1, 0, 1);
  return clamp(Math.max(minutesSignal, lineupSignal), 0, 1);
}

function estimateSixtyPlusProbability(
  player: PlayerProjectionRecord,
  appearanceProbability: number
) {
  if (appearanceProbability === 0) {
    return 0;
  }

  const minutesSignal = clamp((player.expectedMinutes - 45) / 30, 0, 1);
  const starterAdjusted = clamp(player.starterProbability * minutesSignal, 0, 1);
  return clamp(Math.min(appearanceProbability, starterAdjusted), 0, 1);
}

function buildExpectedStatLine(
  player: PlayerProjectionRecord
): AggregateStatLineInput {
  const appearanceProbability = estimateAppearanceProbability(player);
  const sixtyPlusProbability = estimateSixtyPlusProbability(
    player,
    appearanceProbability
  );
  const cleanSheetExpectation =
    (player.statProjection.cleanSheetProbability ?? 0) * sixtyPlusProbability;

  return {
    position: player.position,
    appearances: round(appearanceProbability, 3),
    sixtyPlusAppearances: round(sixtyPlusProbability, 3),
    goals: round(player.statProjection.goals, 3),
    assists: round(player.statProjection.assists, 3),
    cleanSheets: round(cleanSheetExpectation, 3),
    saves: round(player.statProjection.saves, 3),
    goalsConceded: round(player.statProjection.goalsConceded, 3),
    yellowCards: 0,
    redCards: 0,
    penaltySaves: 0,
    penaltyMisses: 0,
    shots: round(player.statProjection.shots, 3),
    shotsOnTarget: round(player.statProjection.shotsOnTarget, 3),
    chancesCreated: round(player.statProjection.chancesCreated, 3),
    successfulPasses: round(player.statProjection.successfulPasses, 3),
    successfulCrosses: round(player.statProjection.successfulCrosses, 3),
    tacklesWon: round(player.statProjection.tacklesWon, 3),
    interceptions: round(player.statProjection.interceptions, 3),
    blocks: round(player.statProjection.blocks, 3),
    goalkeeperWins: round(player.statProjection.goalkeeperWinProbability ?? 0, 3),
    goalkeeperDraws: round(player.statProjection.goalkeeperDrawProbability ?? 0, 3),
  };
}

export function scoreProjectedPlayer(
  player: PlayerProjectionRecord,
  schemaKey: FantasyProjectionSchemaKey
): FantasyScoreResult {
  const schema = fantasyProjectionSchemas[schemaKey];
  return calculateAggregateFantasyScore(
    buildExpectedStatLine(player),
    schema.rules
  );
}

export function scaleProjectionValue(
  baseValue: number,
  sourceProjection: number,
  targetProjection: number
) {
  if (!Number.isFinite(baseValue) || baseValue <= 0) {
    return 0;
  }

  if (!Number.isFinite(sourceProjection) || sourceProjection <= 0) {
    return round(baseValue, 1);
  }

  return round((baseValue * targetProjection) / sourceProjection, 1);
}

export function classifyProjectionQuality(confidence: number) {
  if (confidence >= 0.76) {
    return "high";
  }

  if (confidence >= 0.62) {
    return "medium";
  }

  return "low";
}
