import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const getAuthenticatedRequestUser = vi.fn();
const createUnauthorizedResponse = vi.fn(
  () => new Response(null, { status: 401 })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelPrediction: {
      findMany,
    },
  },
}));

vi.mock("@/lib/request-auth", () => ({
  createUnauthorizedResponse,
  getAuthenticatedRequestUser,
}));

describe("/api/predictions/upcoming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getAuthenticatedRequestUser.mockResolvedValue({ id: "user_1" });
  });

  it("keeps the persisted upcoming prediction feed for existing consumers", async () => {
    const predictions = [
      {
        id: "prediction_1",
        fixtureId: "fixture_db_1",
        lambdaHome: 1.7,
        lambdaAway: 1.1,
      },
    ];
    findMany.mockResolvedValue(predictions);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/predictions/upcoming")
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        fixture: {
          startsAt: { gte: expect.any(Date) },
        },
      },
      include: {
        fixture: {
          include: {
            homeClub: true,
            awayClub: true,
          },
        },
      },
      orderBy: {
        fixture: { startsAt: "asc" },
      },
      take: 50,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ predictions });
  });
});
