import { describe, expect, it } from "vitest";
import {
  assertClassicLineupUnlocked,
  buildClassicLineupLockState,
} from "./fantasy-lineup-lock";

const window = {
  key: "week",
  label: "Week",
  cadence: "weekly" as const,
  starts_at: "2026-07-20T00:00:00Z",
  lock_at: "2026-07-24T21:00:00Z",
  ends_at: "2026-07-27T02:00:00Z",
  match_count: 8,
  slate_keys: [],
};

describe("classic lineup lock", () => {
  it("allows edits before the first ingested kickoff", () => {
    const state = buildClassicLineupLockState(
      window,
      "2026-07-24T21:00:00Z",
      new Date("2026-07-24T20:59:00Z")
    );
    expect(() => assertClassicLineupUnlocked(state)).not.toThrow();
  });

  it("rejects edits once the first match starts", () => {
    const state = buildClassicLineupLockState(
      window,
      "2026-07-24T21:00:00Z",
      new Date("2026-07-24T21:00:00Z")
    );
    expect(() => assertClassicLineupUnlocked(state)).toThrow(
      "first match has kicked off"
    );
  });
});
