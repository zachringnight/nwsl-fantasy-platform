// @vitest-environment node

import { describe, expect, it } from "vitest";
import { loadModelPerformance } from "./model-data-loader";

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
});
