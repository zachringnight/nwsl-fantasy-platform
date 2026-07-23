import { describe, expect, it } from "vitest";
import { calculateFantasyScore } from "./scoring-engine";
import { launchScoringRules } from "./scoring-rules";

describe("launch scoring rules", () => {
  it("applies role-specific goals and clean sheets", () => {
    const base = {
      minutes: 90,
      goals: 1,
      assists: 0,
      cleanSheet: true,
      saves: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      penaltySaves: 0,
      penaltyMisses: 0,
    };
    const defender = calculateFantasyScore({ ...base, position: "DEF" });
    const forward = calculateFantasyScore({ ...base, position: "FWD" });

    expect(defender.breakdown.goals).toBe(10);
    expect(defender.breakdown.cleanSheets).toBe(3);
    expect(forward.breakdown.goals).toBe(8);
    expect(forward.breakdown.cleanSheets).toBe(0);
  });

  it("keeps high-impact discipline and penalty constants explicit", () => {
    expect(launchScoringRules).toMatchObject({
      yellowCard: -2,
      redCard: -5,
      penaltySave: 3,
      penaltyMiss: -4,
      ownGoal: -4,
    });
  });
});
