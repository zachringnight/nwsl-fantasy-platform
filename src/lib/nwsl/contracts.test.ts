import { describe, expect, it } from "vitest";

import { parseNwslMatchRow, parseNwslPlayerRow } from "./contracts";

const PLAYER_ID = "00000000-0000-4000-8000-000000000001";
const TEAM_ID = "00000000-0000-4000-8000-000000000002";
const AWAY_TEAM_ID = "00000000-0000-4000-8000-000000000003";
const MATCH_ID = "00000000-0000-4000-8000-000000000004";

function validPlayerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    provider_id: "espn-player-4472",
    slug: "sam-coffey",
    display_name: "Sam Coffey",
    team_id: TEAM_ID,
    position: "MID",
    jersey_number: 8,
    headshot_url: "https://example.com/headshots/sam-coffey.png",
    availability: "available",
    source_provider: "espn",
    source_fetched_at: "2026-07-23T12:00:00Z",
    source_season: "2026",
    source_url: "https://site.api.espn.com/apis/site/v2/athletes/4472",
    is_fallback: false,
    is_approximated: false,
    created_at: "2026-07-23T12:00:00Z",
    updated_at: "2026-07-23T12:00:00Z",
    ...overrides,
  };
}

function validMatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCH_ID,
    provider_id: "espn-match-778899",
    season: "2026",
    kickoff_at: "2026-08-01T23:00:00Z",
    status: "scheduled",
    home_team_id: TEAM_ID,
    away_team_id: AWAY_TEAM_ID,
    home_score: null,
    away_score: null,
    venue: "Providence Park",
    broadcast: { network: "NWSL+" },
    source_provider: "espn",
    source_fetched_at: "2026-07-23T12:00:00Z",
    source_season: "2026",
    source_url: "https://site.api.espn.com/apis/site/v2/summary?event=778899",
    is_fallback: true,
    is_approximated: false,
    created_at: "2026-07-23T12:00:00Z",
    updated_at: "2026-07-23T12:00:00Z",
    ...overrides,
  };
}

describe("parseNwslPlayerRow", () => {
  it("parses a valid row into a camelCase record with a nested source stamp", () => {
    const record = parseNwslPlayerRow(validPlayerRow());

    expect(record).toEqual({
      id: PLAYER_ID,
      providerId: "espn-player-4472",
      slug: "sam-coffey",
      displayName: "Sam Coffey",
      teamId: TEAM_ID,
      position: "MID",
      jerseyNumber: 8,
      headshotUrl: "https://example.com/headshots/sam-coffey.png",
      availability: "available",
      isApproximated: false,
      source: {
        provider: "espn",
        fetchedAt: "2026-07-23T12:00:00Z",
        sourceSeason: "2026",
        sourceUrl: "https://site.api.espn.com/apis/site/v2/athletes/4472",
        isFallback: false,
      },
      createdAt: "2026-07-23T12:00:00Z",
      updatedAt: "2026-07-23T12:00:00Z",
    });
  });

  it("parses honest-unavailable fields as null rather than requiring a fabricated value", () => {
    const record = parseNwslPlayerRow(
      validPlayerRow({
        team_id: null,
        jersey_number: null,
        headshot_url: null,
        source_url: null,
      }),
    );

    expect(record.teamId).toBeNull();
    expect(record.jerseyNumber).toBeNull();
    expect(record.headshotUrl).toBeNull();
    expect(record.source.sourceUrl).toBeUndefined();
  });

  it("rejects an unrecognized availability status instead of passing it through", () => {
    expect(() =>
      parseNwslPlayerRow(validPlayerRow({ availability: "injured_reserve" })),
    ).toThrow();
  });

  it("rejects an unrecognized position instead of passing it through", () => {
    expect(() => parseNwslPlayerRow(validPlayerRow({ position: "STRIKER" }))).toThrow();
  });

  it("rejects a row missing its stable provider id", () => {
    const row = validPlayerRow();
    delete (row as { provider_id?: string }).provider_id;

    expect(() => parseNwslPlayerRow(row)).toThrow();
  });

  it("rejects a row with an empty stable provider id", () => {
    expect(() => parseNwslPlayerRow(validPlayerRow({ provider_id: "" }))).toThrow();
  });

  it("rejects a row with a non-ISO source timestamp", () => {
    expect(() =>
      parseNwslPlayerRow(validPlayerRow({ source_fetched_at: "not-a-timestamp" })),
    ).toThrow();
  });

  it("rejects a row with a date-only (no time-of-day) timestamp", () => {
    expect(() =>
      parseNwslPlayerRow(validPlayerRow({ created_at: "2026-07-23" })),
    ).toThrow();
  });

  it("rejects a malformed slug (uppercase, spaces, or punctuation)", () => {
    expect(() => parseNwslPlayerRow(validPlayerRow({ slug: "Sam Coffey!" }))).toThrow();
  });

  it("does not enforce cross-row slug uniqueness at the parser layer", () => {
    // Two distinct players sharing the same slug both parse successfully:
    // a single-row Zod parser can only validate shape, not uniqueness
    // across a set of rows. Uniqueness is enforced where it belongs, by
    // the nwsl_players_slug_key unique constraint in
    // supabase/migrations/20260724_nwsl_public_data.sql. This test
    // documents that boundary rather than pretending the parser catches it.
    const rowA = validPlayerRow({ slug: "riley-tiernan" });
    const rowB = validPlayerRow({
      id: TEAM_ID, // any other well-formed uuid, distinct from PLAYER_ID
      provider_id: "espn-player-9911",
      slug: "riley-tiernan",
    });

    const recordA = parseNwslPlayerRow(rowA);
    const recordB = parseNwslPlayerRow(rowB);

    expect(recordA.slug).toBe("riley-tiernan");
    expect(recordB.slug).toBe("riley-tiernan");

    const slugs = [recordA, recordB].map((record) => record.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBeLessThan(slugs.length);
  });
});

describe("parseNwslMatchRow", () => {
  it("parses a valid scheduled row with null scores preserved", () => {
    const record = parseNwslMatchRow(validMatchRow());

    expect(record).toEqual({
      id: MATCH_ID,
      providerId: "espn-match-778899",
      season: "2026",
      kickoffAt: "2026-08-01T23:00:00Z",
      status: "scheduled",
      homeTeamId: TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
      homeScore: null,
      awayScore: null,
      venue: "Providence Park",
      broadcast: { network: "NWSL+" },
      isApproximated: false,
      source: {
        provider: "espn",
        fetchedAt: "2026-07-23T12:00:00Z",
        sourceSeason: "2026",
        sourceUrl: "https://site.api.espn.com/apis/site/v2/summary?event=778899",
        isFallback: true,
      },
      createdAt: "2026-07-23T12:00:00Z",
      updatedAt: "2026-07-23T12:00:00Z",
    });
  });

  it("parses a final row with concrete scores", () => {
    const record = parseNwslMatchRow(
      validMatchRow({ status: "final", home_score: 2, away_score: 1 }),
    );

    expect(record.status).toBe("final");
    expect(record.homeScore).toBe(2);
    expect(record.awayScore).toBe(1);
  });

  it("rejects an unrecognized status instead of passing it through", () => {
    expect(() => parseNwslMatchRow(validMatchRow({ status: "abandoned" }))).toThrow();
  });

  it("rejects a row missing its stable provider id", () => {
    const row = validMatchRow();
    delete (row as { provider_id?: string }).provider_id;

    expect(() => parseNwslMatchRow(row)).toThrow();
  });

  it("rejects a row with an empty stable provider id", () => {
    expect(() => parseNwslMatchRow(validMatchRow({ provider_id: "   " }))).toThrow();
  });

  it("rejects a row with an invalid kickoff timestamp", () => {
    expect(() => parseNwslMatchRow(validMatchRow({ kickoff_at: "kickoff tbd" }))).toThrow();
  });

  it("rejects a row with a kickoff timestamp missing a UTC offset", () => {
    expect(() =>
      parseNwslMatchRow(validMatchRow({ kickoff_at: "2026-08-01T23:00:00" })),
    ).toThrow();
  });
});
