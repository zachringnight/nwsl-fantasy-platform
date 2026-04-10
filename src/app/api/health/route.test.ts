import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

describe("/api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    queryRaw.mockResolvedValue([{ ok: 1 }]);
  });

  it("reports healthy when both the database and model API are healthy", async () => {
    vi.stubEnv("PREDICTION_API_URL", "https://model.example/");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    );

    const { GET } = await import("./route");
    const response = await GET();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://model.example/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "healthy",
      checks: {
        database: { status: "healthy" },
        modelApi: { status: "healthy" },
      },
    });
  });

  it("reports degraded when the model API is not configured", async () => {
    const { GET } = await import("./route");
    const response = await GET();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      checks: {
        database: { status: "healthy" },
        modelApi: {
          status: "degraded",
          message: "PREDICTION_API_URL not set",
        },
      },
    });
  });
});
