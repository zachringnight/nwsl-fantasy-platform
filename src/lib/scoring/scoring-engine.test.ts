import { describe, expect, it } from "vitest";
import {
  calculateFantasyScore,
  calculateAggregateFantasyScore,
  type StatLineInput,
  type AggregateStatLineInput,
} from "./scoring-engine";
import { launchScoringRules } from "./scoring-rules";

describe("calculateFantasyScore", () => {
  it("awards appearance points for any minutes played", () => {
    const input: StatLineInput = {
      position: "FWD",
      minutes: 12,
      goals: 0,
      assists: 0,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    };

    const result = calculateFantasyScore(input);
    expect(result.breakdown.appearance).toBe(1);
    expect(result.breakdown.minutes60Plus).toBe(0);
  });

  it("awards 60+ minute bonus when minutes >= 60", () => {
    const input: StatLineInput = {
      position: "MID",
      minutes: 75,
      goals: 0,
      assists: 0,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    };

    const result = calculateFantasyScore(input);
    expect(result.breakdown.appearance).toBe(1);
    expect(result.breakdown.minutes60Plus).toBe(1);
  });

  it("scores goals correctly by position", () => {
    const fwdResult = calculateFantasyScore({
      position: "FWD",
      minutes: 90,
      goals: 2,
      assists: 0,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    expect(fwdResult.breakdown.goals).toBe(2 * launchScoringRules.goal.FWD);

    const defResult = calculateFantasyScore({
      position: "DEF",
      minutes: 90,
      goals: 1,
      assists: 0,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    expect(defResult.breakdown.goals).toBe(1 * launchScoringRules.goal.DEF);
  });

  it("scores assists correctly", () => {
    const result = calculateFantasyScore({
      position: "MID",
      minutes: 90,
      goals: 0,
      assists: 3,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    expect(result.breakdown.assists).toBe(3 * launchScoringRules.assist);
  });

  it("awards clean sheet only if 60+ minutes played", () => {
    const shortMatch = calculateFantasyScore({
      position: "DEF",
      minutes: 45,
      goals: 0,
      assists: 0,
      cleanSheet: true,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    expect(shortMatch.breakdown.cleanSheets).toBe(0);

    const fullMatch = calculateFantasyScore({
      position: "DEF",
      minutes: 90,
      goals: 0,
      assists: 0,
      cleanSheet: true,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    expect(fullMatch.breakdown.cleanSheets).toBe(launchScoringRules.cleanSheet.DEF);
  });

  it("applies negative points for cards", () => {
    const result = calculateFantasyScore({
      position: "MID",
      minutes: 90,
      goals: 0,
      assists: 0,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 1,
      redCards: 1,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    expect(result.breakdown.yellowCards).toBe(launchScoringRules.yellowCard);
    expect(result.breakdown.redCards).toBe(launchScoringRules.redCard);
    expect(result.breakdown.yellowCards).toBeLessThan(0);
    expect(result.breakdown.redCards).toBeLessThan(0);
  });

  it("scores goalkeeper-specific events", () => {
    const result = calculateFantasyScore({
      position: "GK",
      minutes: 90,
      goals: 0,
      assists: 0,
      cleanSheet: true,
      saves: 5,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 1,
      penaltyMisses: 0,
      goalkeeperWin: true,
    });

    expect(result.breakdown.saves).toBe(5 * launchScoringRules.save);
    expect(result.breakdown.penaltySaves).toBe(launchScoringRules.penaltySave);
    expect(result.breakdown.cleanSheets).toBe(launchScoringRules.cleanSheet.GK);
    expect(result.breakdown.goalkeeperWins).toBe(launchScoringRules.goalkeeperWin);
  });

  it("returns a total that sums all breakdown values", () => {
    const result = calculateFantasyScore({
      position: "FWD",
      minutes: 90,
      goals: 1,
      assists: 1,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    const expectedTotal = Object.values(result.breakdown).reduce(
      (sum, val) => sum + val,
      0
    );
    expect(result.total).toBe(expectedTotal);
  });

  it("returns zero for a player who did not play", () => {
    const result = calculateFantasyScore({
      position: "FWD",
      minutes: 0,
      goals: 0,
      assists: 0,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    });

    expect(result.total).toBe(0);
  });
});

describe("calculateAggregateFantasyScore", () => {
  it("accumulates across multiple appearances", () => {
    const input: AggregateStatLineInput = {
      position: "MID",
      appearances: 5,
      sixtyPlusAppearances: 4,
      goals: 3,
      assists: 2,
      cleanSheets: 0,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 1,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    };

    const result = calculateAggregateFantasyScore(input);
    expect(result.breakdown.appearance).toBe(5);
    expect(result.breakdown.minutes60Plus).toBe(4);
    expect(result.breakdown.goals).toBe(3 * launchScoringRules.goal.MID);
    expect(result.breakdown.assists).toBe(2 * launchScoringRules.assist);
    expect(result.total).toBeGreaterThan(0);
  });
});
