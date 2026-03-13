import type { ScoringCategory } from "@/generated/prisma/enums";

export const apiFootballStatMapping: Record<string, ScoringCategory> = {
  minutes: "APPEARANCE",
  goals: "GOAL",
  assists: "ASSIST",
  saves: "SAVE",
  goals_conceded: "GOALS_CONCEDED",
  yellow_cards: "YELLOW_CARD",
  red_cards: "RED_CARD",
  penalty_saved: "PENALTY_SAVE",
  penalty_missed: "PENALTY_MISS",
};
