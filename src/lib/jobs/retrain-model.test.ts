import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("retrainModelJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("treats a successful retrain response as success", async () => {
    vi.stubEnv("PREDICTION_API_URL", "https://model.example/");
    vi.stubEnv("PREDICTION_API_SECRET", "prediction-secret-123");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "Retrain completed successfully.",
          returncode: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { retrainModelJob } = await import("./retrain-model");
    const result = await retrainModelJob.run({
      startedAt: "2026-04-07T20:30:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://model.example/retrain",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer prediction-secret-123",
        },
      })
    );
    expect(result.status).toBe("success");
    expect(result.summary).toContain("Retrain completed successfully.");
  });

  it("fails the job when the model service reports retrain failure with a 200 response", async () => {
    vi.stubEnv("PREDICTION_API_URL", "https://model.example");
    vi.stubEnv("PREDICTION_API_SECRET", "prediction-secret-123");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          message: "Retrain failed: convergence error",
          returncode: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { retrainModelJob } = await import("./retrain-model");

    await expect(
      retrainModelJob.run({ startedAt: "2026-04-07T20:30:00.000Z" })
    ).rejects.toThrow(
      "Model retrain failed: Retrain failed: convergence error (exit code 1)"
    );
  });
});
