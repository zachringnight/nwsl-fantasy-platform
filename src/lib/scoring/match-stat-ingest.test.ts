import { describe, expect, it, vi } from "vitest";
import { ingestMatchStats } from "./match-stat-ingest";

const seasonId = "nwsl::Football_Season::test";
const matchId = "nwsl::Football_Match::test";

describe("ingestMatchStats", () => {
  it("persists exact match events and transparently estimated volume stats", async () => {
    const statsRows: unknown[] = [];
    const snapshotRows: Array<{
      player_id: string;
      points: number;
      breakdown: Record<string, number>;
      is_approximated: boolean;
      estimated_fields: string[];
    }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url);
      const body = requestUrl.includes("/lineups")
        ? {
            home: {
              teamId: "nwsl::Football_Team::home",
              fielded: [
                {
                  playerId:
                    "nwsl::Football_Player::6fb7c24fe454404c899f51d0a7ea2e84",
                  roleLabel: "Forward",
                  events: [
                    {
                      type: "goal",
                      time: 12,
                      relatedPlayerId:
                        "nwsl::Football_Player::bb0103a05e5f49418ff33df52b8b71b9",
                    },
                    { type: "substitution-out", time: 70 },
                  ],
                },
                {
                  playerId:
                    "nwsl::Football_Player::bb0103a05e5f49418ff33df52b8b71b9",
                  roleLabel: "Midfielder",
                  events: [],
                },
              ],
              benched: [],
            },
            away: {
              teamId: "nwsl::Football_Team::away",
              fielded: [
                {
                  playerId:
                    "nwsl::Football_Player::0021a2896ee54ef191fb324dec97dd78",
                  roleLabel: "Forward",
                  events: [{ type: "yellow-card", time: 44 }],
                },
              ],
              benched: [],
            },
          }
        : {
            matches: [
              {
                matchId,
                matchDateUtc: "2026-07-22T23:00:00Z",
                homeScorePush: 1,
                awayScorePush: 0,
              },
            ],
          };

      return new Response(JSON.stringify(body), { status: 200 });
    });

    const result = await ingestMatchStats(matchId, seasonId, {
      fetcher: fetcher as typeof fetch,
      now: () => new Date("2026-07-23T00:00:00Z"),
      store: {
        async writeStats(rows) {
          statsRows.push(...rows);
        },
        async writeSnapshots(rows) {
          snapshotRows.push(...rows);
        },
      },
    });

    expect(result).toEqual({ statsWritten: 3, snapshotsComputed: 3 });
    expect(statsRows).toHaveLength(3);

    const scorer = snapshotRows.find(
      (row) => row.player_id === "6fb7c24fe454404c899f51d0a7ea2e84"
    );
    const assister = snapshotRows.find(
      (row) => row.player_id === "bb0103a05e5f49418ff33df52b8b71b9"
    );
    const carded = snapshotRows.find(
      (row) => row.player_id === "0021a2896ee54ef191fb324dec97dd78"
    );

    expect(scorer?.breakdown.goals).toBe(8);
    expect(scorer?.breakdown.appearance).toBe(1);
    expect(scorer?.breakdown.minutes60Plus).toBe(1);
    expect(assister?.breakdown.assists).toBe(5);
    expect(carded?.breakdown.yellowCards).toBe(-2);
    expect(scorer?.is_approximated).toBe(true);
    expect(scorer?.estimated_fields).toContain("shots");
  });

  it("rejects a numeric crosswalk id that is absent from the official season feed", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const body = String(url).includes("/lineups")
        ? { home: {}, away: {} }
        : { matches: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    await expect(
      ingestMatchStats("401854039", seasonId, {
        fetcher: fetcher as typeof fetch,
        store: {
          writeStats: vi.fn(),
          writeSnapshots: vi.fn(),
        },
      })
    ).rejects.toThrow("was not found");
  });
});
