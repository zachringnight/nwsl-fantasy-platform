import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  hasConfig: vi.fn(() => true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseServerConfig: mocks.hasConfig,
  getSupabaseServerClient: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import { GET, POST } from "./route";

function payload() {
  const generatedAt = new Date().toISOString();
  const generatedDate = generatedAt.slice(0, 10);
  const matchDate = new Date(
    Date.parse(`${generatedDate}T00:00:00Z`) + 86_400_000
  )
    .toISOString()
    .slice(0, 10);
  return {
    schemaVersion: 1,
    run: {
      runKey: "nwsl-general:v1",
      modelVersion: "v1",
      modelFamily: "spi_lite_baseline",
      trainingCutoff: generatedDate,
      sourceManifestGeneratedAt: generatedAt,
      generatedAt,
      gatingStatus: "current",
      featureStatus: "complete",
      rowCount: 1,
      firstPredictionDate: matchDate,
      lastPredictionDate: matchDate,
      quality: {
        completedAppearanceCoverage: {
          coveredMatches: 1,
          referenceMatches: 1,
          missingMatchIds: [],
        },
        projectedLineupCoverage: {
          coveredMatches: 1,
          referenceMatches: 1,
          missingMatchIds: [],
        },
      },
    },
    predictions: [
      {
        matchId: "m1",
        matchDate,
        matchStatus: "upcoming",
        homeTeam: "Home",
        awayTeam: "Away",
        homeProbability: 0.4,
        drawProbability: 0.3,
        awayProbability: 0.3,
        lambdaHome: 1.3,
        lambdaAway: 1.1,
        bttsYesProbability: 0.5,
        overUnder: {},
        asianHandicap: {},
      },
    ],
  };
}

function post(body: string, token = "test-secret") {
  return new Request("https://example.test/api/general-predictions/publish", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body,
  });
}

describe("general prediction publish route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NWSL_MODEL_PUBLISH_SECRET = "test-secret";
    mocks.hasConfig.mockReturnValue(true);
  });

  it("publishes a validated snapshot and verifies the receipt", async () => {
    const input = payload();
    mocks.rpc.mockImplementation(async (_name, args) => {
      const checksum = (
        await import("node:crypto")
      )
        .createHash("sha256")
        .update(JSON.stringify(input), "utf8")
        .digest("hex");
      expect(args.p_payload.run.payloadChecksum).toBe(checksum);
      return {
        data: {
          runKey: input.run.runKey,
          modelVersion: input.run.modelVersion,
          rowCount: 1,
          payloadChecksum: checksum,
        },
        error: null,
      };
    });

    const response = await POST(post(JSON.stringify(input)));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects completed prediction rows before Supabase", async () => {
    const input = payload();
    input.predictions[0].matchStatus = "completed";

    const response = await POST(post(JSON.stringify(input)));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("supports authenticated run-key readback", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        run_key: "nwsl-general:v1",
        model_version: "v1",
        model_family: "spi_lite_baseline",
        training_cutoff: "2026-07-27",
        source_manifest_generated_at: "2026-07-27T17:55:00Z",
        generated_at: "2026-07-27T18:00:00Z",
        gating_status: "current",
        feature_status: "complete",
        row_count: 1,
        first_prediction_date: "2026-07-30",
        last_prediction_date: "2026-07-30",
        payload_checksum: "a".repeat(64),
        published_at: "2026-07-27T18:01:00Z",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });

    const response = await GET(
      new Request(
        "https://example.test/api/general-predictions/publish?runKey=nwsl-general:v1",
        { headers: { authorization: "Bearer test-secret" } }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.publication.modelVersion).toBe("v1");
  });
});
