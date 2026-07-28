// @vitest-environment node

import { describe, expect, it } from "vitest";
import { loadModelPerformance, loadModelPredictions } from "./model-data-loader";

describe("model data loader", () => {
  it("returns deterministic performance data for server and client hydration", () => {
    const first = loadModelPerformance();
    const second = loadModelPerformance();

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      totalPredictions: 251,
      calibrationBuckets: [],
    });
  });

  it("marks model rows without market prices as no-pick diagnostics", () => {
    const predictions = loadModelPredictions();

    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].marketOdds).toMatchObject({
      hasMarketOdds: false,
    });
    expect(predictions[0].pickSummary).toMatchObject({
      tier: "no_bet",
      actionable: false,
      accepted: false,
      reason: "missing_market_price",
    });
  });
});
