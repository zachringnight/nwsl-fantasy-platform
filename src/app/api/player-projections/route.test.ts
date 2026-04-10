import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const getAuthenticatedRequestUser = vi.fn();
const createUnauthorizedResponse = vi.fn(
  () => new Response(null, { status: 401 })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    playerProjection: {
      findMany,
    },
  },
}));

vi.mock("@/lib/request-auth", () => ({
  createUnauthorizedResponse,
  getAuthenticatedRequestUser,
}));

describe("/api/player-projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getAuthenticatedRequestUser.mockResolvedValue({ id: "user_1" });
  });

  it("requires a persisted player or fixture id filter", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/player-projections")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "At least one of playerId or fixtureId query parameters is required",
    });
  });

  it("keeps the persisted projection contract for existing consumers", async () => {
    const projections = [
      {
        id: "projection_1",
        playerId: "player_db_1",
        fixtureId: "fixture_db_1",
        projectedPoints: 11.4,
      },
    ];
    findMany.mockResolvedValue(projections);

    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/player-projections?playerId=player_db_1&fixtureId=fixture_db_1"
      )
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        playerId: "player_db_1",
        fixtureId: "fixture_db_1",
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ projections });
  });
});
