import { describe, expect, it } from "vitest";
import { resolveEvaluatedMatchCount } from "./model-export-utils";

describe("model web export", () => {
  it("counts the evaluated prediction rows when the metrics CSV omits a count", () => {
    const predictionCsv = [
      "match_id,prob_home",
      "match-1,0.50",
      "match-2,0.40",
    ].join("\n");

    expect(resolveEvaluatedMatchCount(0, predictionCsv)).toBe(2);
  });

  it("keeps an explicit count when no prediction rows are available", () => {
    expect(resolveEvaluatedMatchCount(17)).toBe(17);
  });
});
