import { describe, expect, it } from "vitest";
import {
  browserStateHref,
  nextAvailableDate,
  resolveDateFilter,
  resolveMatchOrder,
  resolveStatusFilter,
  sortedUniqueDates,
  stableSortByDate,
} from "./match-browser-state";

describe("match browser state", () => {
  it("finds the next schedule date and falls back to the latest past date", () => {
    const dates = ["2026-07-28", "2026-07-26", "2026-07-26"];

    expect(sortedUniqueDates(dates)).toEqual(["2026-07-26", "2026-07-28"]);
    expect(nextAvailableDate(dates, "2026-07-27")).toBe("2026-07-28");
    expect(nextAvailableDate(dates, "2026-08-01")).toBe("2026-07-28");
  });

  it("rejects stale or malformed query values", () => {
    const dates = ["2026-07-26", "2026-07-28"];

    expect(resolveDateFilter("2026-07-28", dates)).toBe("2026-07-28");
    expect(resolveDateFilter("2026-02-30", dates)).toBe("next");
    expect(resolveDateFilter("2025-07-28", dates)).toBe("next");
    expect(resolveDateFilter(null, dates)).toBe("next");
    expect(resolveMatchOrder("desc")).toBe("desc");
    expect(resolveMatchOrder("sideways")).toBe("asc");
    expect(resolveStatusFilter("postponed")).toBe("postponed");
    expect(resolveStatusFilter("scheduled")).toBe("all");
  });

  it("sorts dates deterministically while retaining input order for ties", () => {
    const rows = [
      { id: "late-first", date: "2026-07-28" },
      { id: "early-first", date: "2026-07-26" },
      { id: "early-second", date: "2026-07-26" },
    ];

    expect(stableSortByDate(rows, "asc").map((row) => row.id)).toEqual([
      "early-first",
      "early-second",
      "late-first",
    ]);
    expect(stableSortByDate(rows, "desc").map((row) => row.id)).toEqual([
      "late-first",
      "early-first",
      "early-second",
    ]);
  });

  it("preserves season and removes the retired matchday query", () => {
    const params = new URLSearchParams(
      "season=2025&matchday=14&status=live&order=desc"
    );

    expect(
      browserStateHref("/analytics/matches", params, {
        date: "2025-08-02",
      })
    ).toBe(
      "/analytics/matches?season=2025&status=live&order=desc&date=2025-08-02"
    );
  });
});
