import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtureFindMany = vi.fn();
const modelPredictionUpsert = vi.fn();
const fairOddsUpsert = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fixture: {
      findMany: fixtureFindMany,
    },
    modelPrediction: {
      upsert: modelPredictionUpsert,
    },
    fairOdds: {
      upsert: fairOddsUpsert,
    },
  },
}));

describe("syncPredictionsJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("uses the model API batch contract and persists fair odds alongside predictions", async () => {
    vi.stubEnv("PREDICTION_API_URL", "https://model.example/");
    vi.stubEnv("PREDICTION_API_SECRET", "prediction-secret-123");
    fixtureFindMany.mockResolvedValue([
      {
        id: "fixture_db_1",
        startsAt: new Date("2026-04-25T18:00:00.000Z"),
        homeClub: { name: "Kansas City Current" },
        awayClub: { name: "Washington Spirit" },
      },
    ]);
    modelPredictionUpsert.mockResolvedValue({ id: "prediction_1" });
    fairOddsUpsert.mockResolvedValue({});
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          predictions: [
            {
              home_win_prob: 0.52,
              draw_prob: 0.25,
              away_win_prob: 0.23,
              lambda_home: 1.7,
              lambda_away: 1.1,
              projected_home_goals: 2,
              projected_away_goals: 1,
              fair_odds: {
                home: { probability: 0.52, fair_odds: 1.92 },
                draw: { probability: 0.25, fair_odds: 4 },
                away: { probability: 0.23, fair_odds: 4.35 },
              },
              totals: [
                {
                  line: 2.5,
                  over_probability: 0.56,
                  under_probability: 0.44,
                  over_fair_odds: 1.79,
                  under_fair_odds: 2.27,
                },
              ],
              btts_yes_prob: 0.48,
              btts_yes_fair_odds: 2.08,
              model_version: "pure-projection-2025plus-v3",
              model_family: "home_field_baseline",
              blended: false,
              gating_status: "baseline_fallback",
              projection_quality: {
                confidence_score: 0.73,
                confidence_band: "high",
                data_quality_score: 0.84,
                data_quality_band: "high",
                uncertainty: 0.19,
                calibration_applied: false,
                notes: ["Fallback champion used"],
              },
              score_matrix: [[0.18, 0.1]],
              metadata: {
                artifact: { alias: "champion_pure" },
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { syncPredictionsJob } = await import("./sync-predictions");
    const result = await syncPredictionsJob.run({
      startedAt: "2026-04-07T20:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://model.example/batch-predict",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer prediction-secret-123",
        },
      })
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    ).toEqual({
      matches: [
        {
          home_team: "Kansas City Current",
          away_team: "Washington Spirit",
          match_date: "2026-04-25",
          model: "champion_pure",
        },
      ],
    });
    expect(modelPredictionUpsert).toHaveBeenCalledWith({
      where: {
        fixtureId_modelName: {
          fixtureId: "fixture_db_1",
          modelName: "dixon_coles",
        },
      },
      create: expect.objectContaining({
        fixtureId: "fixture_db_1",
        modelName: "dixon_coles",
        homeWinProb: 0.52,
        metadata: expect.objectContaining({
          requested_model: "champion_pure",
          model_family: "home_field_baseline",
          model_version: "pure-projection-2025plus-v3",
          fair_odds: expect.any(Object),
        }),
      }),
      update: expect.objectContaining({
        homeWinProb: 0.52,
        generatedAt: expect.any(Date),
      }),
    });
    expect(fairOddsUpsert).toHaveBeenCalledWith({
      where: {
        predictionId: "prediction_1",
      },
      create: {
        predictionId: "prediction_1",
        homeOdds: 1.92,
        drawOdds: 4,
        awayOdds: 4.35,
        bttsYesOdds: 2.08,
        over25Odds: 1.79,
        under25Odds: 2.27,
      },
      update: {
        homeOdds: 1.92,
        drawOdds: 4,
        awayOdds: 4.35,
        bttsYesOdds: 2.08,
        over25Odds: 1.79,
        under25Odds: 2.27,
      },
    });
    expect(result.status).toBe("success");
    expect(result.summary).toContain("Synced 1 predictions");
  });

  it("fails fast when prediction jobs are enabled without a shared API secret", async () => {
    vi.stubEnv("PREDICTION_API_URL", "https://model.example");
    fixtureFindMany.mockResolvedValue([
      {
        id: "fixture_db_1",
        startsAt: new Date("2026-04-25T18:00:00.000Z"),
        homeClub: { name: "Kansas City Current" },
        awayClub: { name: "Washington Spirit" },
      },
    ]);

    const { syncPredictionsJob } = await import("./sync-predictions");

    await expect(
      syncPredictionsJob.run({ startedAt: "2026-04-07T20:00:00.000Z" })
    ).rejects.toThrow(
      "PREDICTION_API_SECRET must be configured when prediction jobs are enabled"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects mismatched batch responses instead of silently saving partial data", async () => {
    vi.stubEnv("PREDICTION_API_URL", "https://model.example");
    vi.stubEnv("PREDICTION_API_SECRET", "prediction-secret-123");
    fixtureFindMany.mockResolvedValue([
      {
        id: "fixture_db_1",
        startsAt: new Date("2026-04-25T18:00:00.000Z"),
        homeClub: { name: "Kansas City Current" },
        awayClub: { name: "Washington Spirit" },
      },
      {
        id: "fixture_db_2",
        startsAt: new Date("2026-04-26T18:00:00.000Z"),
        homeClub: { name: "Orlando Pride" },
        awayClub: { name: "Racing Louisville" },
      },
    ]);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          predictions: [
            {
              home_win_prob: 0.52,
              draw_prob: 0.25,
              away_win_prob: 0.23,
              lambda_home: 1.7,
              lambda_away: 1.1,
              projected_home_goals: 2,
              projected_away_goals: 1,
              fair_odds: {
                home: { probability: 0.52, fair_odds: 1.92 },
                draw: { probability: 0.25, fair_odds: 4 },
                away: { probability: 0.23, fair_odds: 4.35 },
              },
              totals: [],
              btts_yes_prob: 0.48,
              btts_yes_fair_odds: 2.08,
              model_version: "pure-projection-2025plus-v3",
              model_family: "home_field_baseline",
              blended: false,
              gating_status: "baseline_fallback",
              projection_quality: {
                confidence_score: 0.73,
                confidence_band: "high",
                data_quality_score: 0.84,
                data_quality_band: "high",
                uncertainty: 0.19,
                calibration_applied: false,
                notes: [],
              },
              score_matrix: [[0.18, 0.1]],
              metadata: null,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { syncPredictionsJob } = await import("./sync-predictions");

    await expect(
      syncPredictionsJob.run({ startedAt: "2026-04-07T20:00:00.000Z" })
    ).rejects.toThrow("Model API returned 1 predictions for 2 fixtures");
    expect(modelPredictionUpsert).not.toHaveBeenCalled();
  });
});
