import type { PlayerPosition } from "@/types/fantasy";

export interface FantasyScoringRules {
  appearance: number;
  minutes60Plus: number;
  goal: Record<PlayerPosition, number>;
  assist: number;
  shot: number;
  shotOnTarget: number;
  chanceCreated: number;
  successfulPass: number;
  successfulCross: number;
  foulWon: number;
  foulCommitted: number;
  tackleWon: number;
  interception: number;
  block: number;
  cleanSheet: Record<PlayerPosition, number>;
  save: number;
  goalsConceded: Record<PlayerPosition, number>;
  yellowCard: number;
  redCard: number;
  penaltySave: number;
  penaltyMiss: number;
  penaltyConceded: number;
  ownGoal: number;
  goalkeeperWin: number;
  goalkeeperDraw: number;
}

// House soccer scoring model:
// - keeps the simple season-long floor managers expect
// - adds the peripheral actions that make DFS soccer feel real
// - is informed by Yahoo/DraftKings-style soccer DFS scoring conventions
export const launchScoringRules: FantasyScoringRules = {
  appearance: 1,
  minutes60Plus: 1,
  goal: {
    GK: 10,
    DEF: 10,
    MID: 8,
    FWD: 8,
  },
  assist: 5,
  shot: 0.5,
  shotOnTarget: 2,
  chanceCreated: 1,
  successfulPass: 0.03,
  successfulCross: 0.5,
  foulWon: 0.5,
  foulCommitted: -0.5,
  tackleWon: 0.75,
  interception: 0.5,
  block: 1,
  cleanSheet: {
    GK: 6,
    DEF: 3,
    MID: 0,
    FWD: 0,
  },
  save: 1.5,
  goalsConceded: {
    GK: -2,
    DEF: -0.5,
    MID: 0,
    FWD: 0,
  },
  yellowCard: -2,
  redCard: -5,
  penaltySave: 3,
  penaltyMiss: -4,
  penaltyConceded: -1,
  ownGoal: -4,
  goalkeeperWin: 4,
  goalkeeperDraw: 2,
};

export const classicScoringRules = launchScoringRules;
export const salaryCapScoringRules = launchScoringRules;
