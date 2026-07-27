import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  runAttempts: 0,
  mapped: { provenance: { season: "2026" }, players: [] },
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    loader: () => Promise<unknown>
  ): (() => Promise<unknown>) => {
    let cached = false;
    let value: unknown;
    return async () => {
      if (cached) return value;
      value = await loader();
      cached = true;
      return value;
    };
  },
}));

function rowQuery() {
  const result = Promise.resolve({ data: [], error: null });
  const query = {
    select: () => query,
    eq: () => query,
    range: () => query,
    order: () => query,
    then: result.then.bind(result),
  };
  return query;
}

function runQuery() {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => {
      state.runAttempts += 1;
      if (state.runAttempts === 1) {
        return {
          data: null,
          error: { code: "XX000", message: "temporary database failure" },
        };
      }
      return {
        data: {
          id: "00000000-0000-4000-8000-000000000026",
        },
        error: null,
      };
    },
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseServerConfig: () => true,
  getSupabaseServerClient: () => ({
    from: (table: string) =>
      table === "nwsl_data_runs" ? runQuery() : rowQuery(),
  }),
}));

vi.mock("./nwsl-public-data-mapper", () => ({
  validateNwslPublicRows: () => [],
  mapNwslPublicRows: () => state.mapped,
}));

import { getLiveNwslPublicData } from "./live-nwsl-public-data";

describe("getLiveNwslPublicData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not cache a transient Supabase failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getLiveNwslPublicData()).resolves.toBeNull();
    await expect(getLiveNwslPublicData()).resolves.toBe(state.mapped);
    await expect(getLiveNwslPublicData()).resolves.toBe(state.mapped);

    expect(state.runAttempts).toBe(2);
  });
});
