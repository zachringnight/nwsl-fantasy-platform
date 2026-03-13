import type { PlayerPosition } from "@/types/fantasy";
import {
  launchScoringRules,
  type FantasyScoringRules,
} from "@/lib/scoring/scoring-rules";

export interface StatLineInput {
  position: PlayerPosition;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  penaltySaves: number;
  penaltyMisses: number;
  shots?: number;
  shotsOnTarget?: number;
  chancesCreated?: number;
  successfulPasses?: number;
  successfulCrosses?: number;
  foulsWon?: number;
  foulsCommitted?: number;
  tacklesWon?: number;
  interceptions?: number;
  blocks?: number;
  penaltyConceded?: number;
  ownGoals?: number;
  goalkeeperWin?: boolean;
  goalkeeperDraw?: boolean;
}

export interface AggregateStatLineInput {
  position: PlayerPosition;
  appearances: number;
  sixtyPlusAppearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  penaltySaves: number;
  penaltyMisses: number;
  shots?: number;
  shotsOnTarget?: number;
  chancesCreated?: number;
  successfulPasses?: number;
  successfulCrosses?: number;
  foulsWon?: number;
  foulsCommitted?: number;
  tacklesWon?: number;
  interceptions?: number;
  blocks?: number;
  penaltyConceded?: number;
  ownGoals?: number;
  goalkeeperWins?: number;
  goalkeeperDraws?: number;
}

export interface FantasyScoreResult {
  total: number;
  breakdown: Record<string, number>;
}

function toNumber(value: number | undefined) {
  return value ?? 0;
}

function createBreakdown(
  input: AggregateStatLineInput,
  rules: FantasyScoringRules
) {
  return {
    appearance: input.appearances * rules.appearance,
    minutes60Plus: input.sixtyPlusAppearances * rules.minutes60Plus,
    goals: input.goals * rules.goal[input.position],
    assists: input.assists * rules.assist,
    shots: toNumber(input.shots) * rules.shot,
    shotsOnTarget: toNumber(input.shotsOnTarget) * rules.shotOnTarget,
    chancesCreated: toNumber(input.chancesCreated) * rules.chanceCreated,
    successfulPasses: toNumber(input.successfulPasses) * rules.successfulPass,
    successfulCrosses:
      toNumber(input.successfulCrosses) * rules.successfulCross,
    foulsWon: toNumber(input.foulsWon) * rules.foulWon,
    foulsCommitted: toNumber(input.foulsCommitted) * rules.foulCommitted,
    tacklesWon: toNumber(input.tacklesWon) * rules.tackleWon,
    interceptions: toNumber(input.interceptions) * rules.interception,
    blocks: toNumber(input.blocks) * rules.block,
    cleanSheets: input.cleanSheets * rules.cleanSheet[input.position],
    saves: input.saves * rules.save,
    goalsConceded:
      input.goalsConceded * rules.goalsConceded[input.position],
    yellowCards: input.yellowCards * rules.yellowCard,
    redCards: input.redCards * rules.redCard,
    penaltySaves: input.penaltySaves * rules.penaltySave,
    penaltyMisses: input.penaltyMisses * rules.penaltyMiss,
    penaltyConceded:
      toNumber(input.penaltyConceded) * rules.penaltyConceded,
    ownGoals: toNumber(input.ownGoals) * rules.ownGoal,
    goalkeeperWins: toNumber(input.goalkeeperWins) * rules.goalkeeperWin,
    goalkeeperDraws: toNumber(input.goalkeeperDraws) * rules.goalkeeperDraw,
  };
}

function sumBreakdown(breakdown: Record<string, number>) {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

export function calculateAggregateFantasyScore(
  input: AggregateStatLineInput,
  rules: FantasyScoringRules = launchScoringRules
): FantasyScoreResult {
  const breakdown = createBreakdown(input, rules);

  return {
    total: sumBreakdown(breakdown),
    breakdown,
  };
}

export function calculateFantasyScore(
  input: StatLineInput,
  rules: FantasyScoringRules = launchScoringRules
): FantasyScoreResult {
  return calculateAggregateFantasyScore(
    {
      position: input.position,
      appearances: input.minutes > 0 ? 1 : 0,
      sixtyPlusAppearances: input.minutes >= 60 ? 1 : 0,
      goals: input.goals,
      assists: input.assists,
      cleanSheets: input.cleanSheet && input.minutes >= 60 ? 1 : 0,
      saves: input.saves,
      goalsConceded: input.goalsConceded,
      yellowCards: input.yellowCards,
      redCards: input.redCards,
      penaltySaves: input.penaltySaves,
      penaltyMisses: input.penaltyMisses,
      shots: input.shots,
      shotsOnTarget: input.shotsOnTarget,
      chancesCreated: input.chancesCreated,
      successfulPasses: input.successfulPasses,
      successfulCrosses: input.successfulCrosses,
      foulsWon: input.foulsWon,
      foulsCommitted: input.foulsCommitted,
      tacklesWon: input.tacklesWon,
      interceptions: input.interceptions,
      blocks: input.blocks,
      penaltyConceded: input.penaltyConceded,
      ownGoals: input.ownGoals,
      goalkeeperWins:
        input.position === "GK" && input.goalkeeperWin ? 1 : 0,
      goalkeeperDraws:
        input.position === "GK" && input.goalkeeperDraw ? 1 : 0,
    },
    rules
  );
}
