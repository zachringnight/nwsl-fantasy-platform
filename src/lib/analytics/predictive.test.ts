import { describe, expect, it } from "vitest";
import {
  buildScoreMatrix,
  canonicalizeTeamName,
  starterStatusFromProbability,
} from "@/lib/analytics/predictive";

describe("predictive analytics helpers", () => {
  it("normalizes common team aliases to the FBref canonical names", () => {
    expect(canonicalizeTeamName("Kansas City Current")).toBe("Current");
    expect(canonicalizeTeamName("Seattle Reign FC")).toBe("Reign");
    expect(canonicalizeTeamName("San Diego Wave FC")).toBe("SD Wave");
    expect(canonicalizeTeamName("North Carolina Courage")).toBe("NC Courage");
  });

  it("builds a normalized score matrix", () => {
    const matrix = buildScoreMatrix(1.6, 1.1);
    const totalProbability = matrix.flat().reduce((sum, value) => sum + value, 0);

    expect(matrix).toHaveLength(7);
    expect(matrix[0]).toHaveLength(7);
    expect(totalProbability).toBeCloseTo(1, 6);
  });

  it("maps starter probability into consumer-ready lineup statuses", () => {
    expect(starterStatusFromProbability(0.88, "available")).toBe("Projected starter");
    expect(starterStatusFromProbability(0.7, "available")).toBe("Likely starter");
    expect(starterStatusFromProbability(0.5, "available")).toBe("Rotation risk");
    expect(starterStatusFromProbability(0.18, "available")).toBe("Bench risk");
    expect(starterStatusFromProbability(0.9, "out")).toBe("Unavailable");
  });
});
