import { describe, expect, it } from "vitest";
import {
  estimateCleanSheetProbability,
  distributeExpectedGoals,
  calculateProjectedFantasyPoints,
  calculateExpectedFantasyPoints,
  generatePlayerProjection,
} from "./projection-engine";
import type { ProjectionPlayerInput, MatchProjection, PlayerProjection } from "./types";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type { FantasyScoringRules } from "@/lib/scoring/scoring-rules";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatchProjection(
  overrides: Partial<MatchProjection> = {}
): MatchProjection {
  return {
    fixtureId: "fixture-1",
    homeClubId: "club-home",
    awayClubId: "club-away",
    homeWinProbability: 0.45,
    drawProbability: 0.25,
    awayWinProbability: 0.3,
    expectedHomeGoals: 1.5,
    expectedAwayGoals: 1.0,
    bttsPercent: 55,
    overUnderLine: 2.5,
    overPercent: 52,
    updatedAt: "2026-03-15T00:00:00Z",
    ...overrides,
  };
}

function makePlayer(
  overrides: Partial<ProjectionPlayerInput> = {}
): ProjectionPlayerInput {
  return {
    playerId: "player-1",
    position: "FWD",
    clubId: "club-home",
    expectedMinutes: 90,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// estimateCleanSheetProbability
// ---------------------------------------------------------------------------

describe("estimateCleanSheetProbability", () => {
  it("returns 1 when expected goals conceded is 0", () => {
    expect(estimateCleanSheetProbability(0)).toBe(1);
  });

  it("returns e^(-1) ~ 0.3679 when expected goals conceded is 1", () => {
    const result = estimateCleanSheetProbability(1);
    expect(result).toBeCloseTo(Math.exp(-1), 4);
  });

  it("returns e^(-2) ~ 0.1353 when expected goals conceded is 2", () => {
    const result = estimateCleanSheetProbability(2);
    expect(result).toBeCloseTo(Math.exp(-2), 4);
  });

  it("returns 1 for negative expected goals (defensive edge case)", () => {
    expect(estimateCleanSheetProbability(-0.5)).toBe(1);
  });

  it("decreases monotonically as expected goals increase", () => {
    const values = [0, 0.5, 1.0, 1.5, 2.0, 3.0];
    const probs = values.map(estimateCleanSheetProbability);
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeLessThan(probs[i - 1]);
    }
  });

  it("is always between 0 and 1 for non-negative inputs", () => {
    for (const xg of [0, 0.1, 0.5, 1, 2, 5, 10]) {
      const prob = estimateCleanSheetProbability(xg);
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// distributeExpectedGoals
// ---------------------------------------------------------------------------

describe("distributeExpectedGoals", () => {
  it("distributes goals across positions using default weights", () => {
    const players: ProjectionPlayerInput[] = [
      makePlayer({ playerId: "fwd1", position: "FWD" }),
      makePlayer({ playerId: "mid1", position: "MID" }),
      makePlayer({ playerId: "def1", position: "DEF" }),
      makePlayer({ playerId: "gk1", position: "GK" }),
    ];

    const result = distributeExpectedGoals(2.0, players);

    // With all 4 positions represented, weights are already normalised.
    expect(result.get("fwd1")).toBeCloseTo(2.0 * 0.4, 4);
    expect(result.get("mid1")).toBeCloseTo(2.0 * 0.35, 4);
    expect(result.get("def1")).toBeCloseTo(2.0 * 0.2, 4);
    expect(result.get("gk1")).toBeCloseTo(2.0 * 0.05, 4);
  });

  it("re-normalises weights when not all positions are present", () => {
    const players: ProjectionPlayerInput[] = [
      makePlayer({ playerId: "fwd1", position: "FWD" }),
      makePlayer({ playerId: "mid1", position: "MID" }),
    ];

    const result = distributeExpectedGoals(1.5, players);

    // Only FWD (0.4) and MID (0.35) are present; sum = 0.75.
    const fwdShare = (0.4 / 0.75) * 1.5;
    const midShare = (0.35 / 0.75) * 1.5;
    expect(result.get("fwd1")).toBeCloseTo(fwdShare, 4);
    expect(result.get("mid1")).toBeCloseTo(midShare, 4);
  });

  it("splits equally within a position group by default", () => {
    const players: ProjectionPlayerInput[] = [
      makePlayer({ playerId: "fwd1", position: "FWD" }),
      makePlayer({ playerId: "fwd2", position: "FWD" }),
    ];

    const result = distributeExpectedGoals(2.0, players);

    // Only FWD present, weight = 1.0 after re-normalisation.
    // Split equally: 1.0 each.
    expect(result.get("fwd1")).toBeCloseTo(1.0, 4);
    expect(result.get("fwd2")).toBeCloseTo(1.0, 4);
  });

  it("weights by goalsPer90 within a position group when available", () => {
    const players: ProjectionPlayerInput[] = [
      makePlayer({ playerId: "fwd1", position: "FWD", goalsPer90: 0.6 }),
      makePlayer({ playerId: "fwd2", position: "FWD", goalsPer90: 0.2 }),
    ];

    const result = distributeExpectedGoals(2.0, players);

    // FWD group gets all 2.0 goals. Split 0.6:0.2 = 3:1.
    expect(result.get("fwd1")).toBeCloseTo(1.5, 4);
    expect(result.get("fwd2")).toBeCloseTo(0.5, 4);
  });

  it("adjusts for expected minutes", () => {
    const players: ProjectionPlayerInput[] = [
      makePlayer({ playerId: "fwd1", position: "FWD", expectedMinutes: 90 }),
      makePlayer({ playerId: "fwd2", position: "FWD", expectedMinutes: 45 }),
    ];

    const result = distributeExpectedGoals(2.0, players);

    // Equal goalsPer90 (both 0 so equal split), but fwd2 only plays half.
    // fwd1 gets 1.0 * (90/90) = 1.0, fwd2 gets 1.0 * (45/90) = 0.5.
    expect(result.get("fwd1")).toBeCloseTo(1.0, 4);
    expect(result.get("fwd2")).toBeCloseTo(0.5, 4);
  });

  it("returns zeros when expected team goals is zero", () => {
    const players: ProjectionPlayerInput[] = [
      makePlayer({ playerId: "fwd1", position: "FWD" }),
      makePlayer({ playerId: "mid1", position: "MID" }),
    ];

    const result = distributeExpectedGoals(0, players);

    expect(result.get("fwd1")).toBe(0);
    expect(result.get("mid1")).toBe(0);
  });

  it("returns an empty map for an empty player list", () => {
    const result = distributeExpectedGoals(2.0, []);
    expect(result.size).toBe(0);
  });

  it("total distributed goals approximately equal the team expected goals", () => {
    const players: ProjectionPlayerInput[] = [
      makePlayer({ playerId: "fwd1", position: "FWD" }),
      makePlayer({ playerId: "fwd2", position: "FWD" }),
      makePlayer({ playerId: "mid1", position: "MID" }),
      makePlayer({ playerId: "mid2", position: "MID" }),
      makePlayer({ playerId: "mid3", position: "MID" }),
      makePlayer({ playerId: "def1", position: "DEF" }),
      makePlayer({ playerId: "def2", position: "DEF" }),
      makePlayer({ playerId: "def3", position: "DEF" }),
      makePlayer({ playerId: "def4", position: "DEF" }),
      makePlayer({ playerId: "gk1", position: "GK" }),
    ];

    const teamXG = 1.8;
    const result = distributeExpectedGoals(teamXG, players);

    const totalDistributed = [...result.values()].reduce((a, b) => a + b, 0);
    expect(totalDistributed).toBeCloseTo(teamXG, 2);
  });
});

// ---------------------------------------------------------------------------
// calculateExpectedFantasyPoints
// ---------------------------------------------------------------------------

describe("calculateExpectedFantasyPoints", () => {
  it("awards appearance and 60+ bonus for a full 90-minute starter", () => {
    const points = calculateExpectedFantasyPoints(
      0, // goals
      0, // assists
      90, // minutes
      0, // saves
      0, // cleanSheetProb
      2, // expectedGoalsConceded
      "FWD"
    );

    // appearance (1) + 60+ (1) + 0 goals + 0 CS + 0 GC (FWD) = 2
    expect(points).toBe(2);
  });

  it("does not award 60+ bonus for a sub who plays 45 minutes", () => {
    const points = calculateExpectedFantasyPoints(0, 0, 45, 0, 0, 0, "MID");
    // appearance (1) only
    expect(points).toBe(1);
  });

  it("scores goals by position correctly", () => {
    const fwdPoints = calculateExpectedFantasyPoints(
      1, 0, 90, 0, 0, 0, "FWD"
    );
    const defPoints = calculateExpectedFantasyPoints(
      1, 0, 90, 0, 0, 0, "DEF"
    );

    // FWD: 1 + 1 + 8 = 10; DEF: 1 + 1 + 10 = 12
    expect(fwdPoints).toBe(1 + 1 + launchScoringRules.goal.FWD);
    expect(defPoints).toBe(1 + 1 + launchScoringRules.goal.DEF);
  });

  it("weights clean sheet by probability", () => {
    const withCS = calculateExpectedFantasyPoints(
      0, 0, 90, 0, 1.0, 0, "DEF"
    );
    const halfCS = calculateExpectedFantasyPoints(
      0, 0, 90, 0, 0.5, 0, "DEF"
    );
    const noCS = calculateExpectedFantasyPoints(
      0, 0, 90, 0, 0, 0, "DEF"
    );

    // DEF clean sheet is 3 points.
    expect(withCS - noCS).toBeCloseTo(launchScoringRules.cleanSheet.DEF, 4);
    expect(halfCS - noCS).toBeCloseTo(
      0.5 * launchScoringRules.cleanSheet.DEF,
      4
    );
  });

  it("does not award clean sheet points for under 60 minutes", () => {
    const points = calculateExpectedFantasyPoints(
      0, 0, 45, 0, 1.0, 0, "DEF"
    );
    // appearance only, no 60+ bonus, no CS
    expect(points).toBe(1);
  });

  it("scores GK saves correctly", () => {
    const points = calculateExpectedFantasyPoints(
      0, 0, 90, 5, 0, 2, "GK"
    );
    // 1 (app) + 1 (60+) + 5*1.5 (saves) + 2*(-2) (GC) = 2 + 7.5 - 4 = 5.5
    expect(points).toBeCloseTo(5.5, 4);
  });

  it("applies goals conceded penalty for DEF but not FWD", () => {
    const defPoints = calculateExpectedFantasyPoints(
      0, 0, 90, 0, 0, 2, "DEF"
    );
    const fwdPoints = calculateExpectedFantasyPoints(
      0, 0, 90, 0, 0, 2, "FWD"
    );

    // DEF: 2 + 2*(-0.5) = 1; FWD: 2 + 2*(0) = 2
    expect(defPoints).toBe(1);
    expect(fwdPoints).toBe(2);
  });

  it("handles fractional projected stats smoothly", () => {
    const points = calculateExpectedFantasyPoints(
      0.3, // 0.3 expected goals
      0.5, // 0.5 expected assists
      90,
      0,
      0.4,
      1.2,
      "MID"
    );

    const expected =
      1 + // appearance
      1 + // 60+
      0.3 * launchScoringRules.goal.MID + // goals
      0.5 * launchScoringRules.assist + // assists
      0.4 * launchScoringRules.cleanSheet.MID + // CS (0 for MID)
      1.2 * launchScoringRules.goalsConceded.MID; // GC (0 for MID)

    expect(points).toBeCloseTo(expected, 4);
  });
});

// ---------------------------------------------------------------------------
// calculateProjectedFantasyPoints
// ---------------------------------------------------------------------------

describe("calculateProjectedFantasyPoints", () => {
  it("converts a player projection to fantasy points via the scoring engine", () => {
    const projection: PlayerProjection = {
      playerId: "player-1",
      fixtureId: "fixture-1",
      projectedPoints: 0, // will be recalculated
      projectedMinutes: 90,
      projectedGoals: 1,
      projectedAssists: 1,
      projectedCleanSheet: 0.8, // >= 0.5, so treated as clean sheet
      projectedSaves: 0,
      confidence: "high",
      updatedAt: "2026-03-15T00:00:00Z",
    };

    const points = calculateProjectedFantasyPoints(projection, "DEF");

    // DEF scoring: app(1) + 60+(1) + goal(10) + assist(5) + CS(3) = 20
    expect(points).toBe(20);
  });

  it("does not award clean sheet when probability < 0.5", () => {
    const projection: PlayerProjection = {
      playerId: "player-1",
      fixtureId: "fixture-1",
      projectedPoints: 0,
      projectedMinutes: 90,
      projectedGoals: 0,
      projectedAssists: 0,
      projectedCleanSheet: 0.3,
      projectedSaves: 0,
      confidence: "medium",
      updatedAt: "2026-03-15T00:00:00Z",
    };

    const points = calculateProjectedFantasyPoints(projection, "DEF");

    // No CS, so goals conceded estimated from probability.
    // Expected GC = 1/0.3 - 1 ~ 2.33, rounds to 2.
    // DEF: 1 + 1 + 2*(-0.5) = 1
    expect(points).toBe(1);
  });

  it("works with custom scoring rules", () => {
    const customRules: FantasyScoringRules = {
      ...launchScoringRules,
      goal: { GK: 20, DEF: 20, MID: 15, FWD: 12 },
    };

    const projection: PlayerProjection = {
      playerId: "player-1",
      fixtureId: "fixture-1",
      projectedPoints: 0,
      projectedMinutes: 90,
      projectedGoals: 1,
      projectedAssists: 0,
      projectedCleanSheet: 0.9,
      projectedSaves: 0,
      confidence: "high",
      updatedAt: "2026-03-15T00:00:00Z",
    };

    const points = calculateProjectedFantasyPoints(
      projection,
      "FWD",
      customRules
    );

    // FWD with custom rules: app(1) + 60+(1) + goal(12) = 14
    expect(points).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// generatePlayerProjection (integration)
// ---------------------------------------------------------------------------

describe("generatePlayerProjection", () => {
  it("generates a projection for a home-team forward", () => {
    const match = makeMatchProjection();
    const player = makePlayer({
      playerId: "fwd1",
      position: "FWD",
      clubId: "club-home",
    });

    const result = generatePlayerProjection(match, player, [player]);

    expect(result.playerId).toBe("fwd1");
    expect(result.fixtureId).toBe("fixture-1");
    expect(result.projectedMinutes).toBe(90);
    expect(result.projectedGoals).toBeGreaterThan(0);
    expect(result.projectedAssists).toBeGreaterThan(0);
    expect(result.projectedCleanSheet).toBeGreaterThan(0);
    expect(result.projectedCleanSheet).toBeLessThanOrEqual(1);
    expect(result.projectedSaves).toBe(0); // not a GK
    expect(result.projectedPoints).toBeGreaterThan(0);
    expect(result.confidence).toBe("high");
  });

  it("generates a projection for an away-team goalkeeper", () => {
    const match = makeMatchProjection();
    const player = makePlayer({
      playerId: "gk1",
      position: "GK",
      clubId: "club-away",
    });

    const result = generatePlayerProjection(match, player, [player]);

    expect(result.projectedSaves).toBeGreaterThan(0);
    // Away GK faces home xG of 1.5 => CS prob = e^(-1.5) ~ 0.223
    expect(result.projectedCleanSheet).toBeCloseTo(
      Math.exp(-1.5),
      2
    );
  });

  it("produces higher goal projections for players with higher goalsPer90", () => {
    const match = makeMatchProjection({ expectedHomeGoals: 2.0 });

    const prolificStriker = makePlayer({
      playerId: "fwd1",
      position: "FWD",
      clubId: "club-home",
      goalsPer90: 0.8,
    });
    const benchStriker = makePlayer({
      playerId: "fwd2",
      position: "FWD",
      clubId: "club-home",
      goalsPer90: 0.2,
    });

    const allPlayers = [prolificStriker, benchStriker];

    const proj1 = generatePlayerProjection(
      match,
      prolificStriker,
      allPlayers
    );
    const proj2 = generatePlayerProjection(match, benchStriker, allPlayers);

    expect(proj1.projectedGoals).toBeGreaterThan(proj2.projectedGoals);
  });

  it("assigns lower confidence to short-minute players", () => {
    const match = makeMatchProjection();

    const starter = makePlayer({
      playerId: "fwd1",
      expectedMinutes: 90,
    });
    const sub = makePlayer({
      playerId: "fwd2",
      expectedMinutes: 30,
    });

    const proj1 = generatePlayerProjection(match, starter, [starter]);
    const proj2 = generatePlayerProjection(match, sub, [sub]);

    expect(proj1.confidence).toBe("high");
    expect(proj2.confidence).toBe("low");
  });

  it("projects clean sheet probability based on opponent expected goals", () => {
    const lowScoringMatch = makeMatchProjection({
      expectedHomeGoals: 0.5,
      expectedAwayGoals: 0.5,
    });
    const highScoringMatch = makeMatchProjection({
      expectedHomeGoals: 3.0,
      expectedAwayGoals: 3.0,
    });

    const player = makePlayer({ position: "DEF", clubId: "club-home" });

    const lowScoring = generatePlayerProjection(
      lowScoringMatch,
      player,
      [player]
    );
    const highScoring = generatePlayerProjection(
      highScoringMatch,
      player,
      [player]
    );

    // Low-scoring match should have higher CS probability.
    expect(lowScoring.projectedCleanSheet).toBeGreaterThan(
      highScoring.projectedCleanSheet
    );
  });
});
