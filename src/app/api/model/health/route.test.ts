import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedRequestUser = vi.fn();
const createUnauthorizedResponse = vi.fn(
  () => new Response(null, { status: 401 })
);
const fetchMock = vi.fn();

vi.mock("@/lib/request-auth", () => ({
  createUnauthorizedResponse,
  getAuthenticatedRequestUser,
}));

describe("/api/model/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    getAuthenticatedRequestUser.mockResolvedValue({ id: "user_1" });
  });

  it("reports degraded when the prediction API is not configured", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/model/health")
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      error: "PREDICTION_API_URL not configured",
    });
  });

  it("returns healthy model API status when the upstream health check succeeds", async () => {
    vi.stubEnv("PREDICTION_API_URL", "https://model.example/");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          models_available: ["champion_pure"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/model/health")
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://model.example/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "healthy",
      statusCode: 200,
      data: {
        status: "ok",
        models_available: ["champion_pure"],
      },
    });
  });
});
