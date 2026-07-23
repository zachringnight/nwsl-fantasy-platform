import { describe, expect, it } from "vitest";
import { buildSalaryCapLeaderboard } from "./fantasy-leaderboard";
import type {
  FantasyLeagueMembershipRecord,
  FantasySalaryCapEntryRecord,
  FantasySalaryCapEntrySlotRecord,
  FantasySlateWindow,
} from "@/types/fantasy";

const slate: FantasySlateWindow = {
  key: "slate",
  label: "Slate",
  cadence: "daily",
  starts_at: "2026-07-22T00:00:00Z",
  lock_at: "2026-07-22T00:00:00Z",
  ends_at: "2026-07-23T00:00:00Z",
  match_count: 1,
  slate_keys: ["slate"],
};

function entry(id: string, userId: string): FantasySalaryCapEntryRecord {
  return {
    id,
    league_id: "league",
    user_id: userId,
    slate_key: "slate",
    entry_name: `Entry ${id}`,
    status: "submitted",
    salary_spent: 100,
    submitted_at: "2026-07-21T00:00:00Z",
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
  };
}

function slot(
  entryId: string,
  userId: string,
  playerId: string
): FantasySalaryCapEntrySlotRecord {
  return {
    id: `${entryId}-${playerId}`,
    entry_id: entryId,
    league_id: "league",
    user_id: userId,
    lineup_slot: "FWD_1",
    player_id: playerId,
    player_name: playerId,
    player_position: "FWD",
    club_name: "Club",
    salary_cost: 10,
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
  };
}

describe("salary-cap leaderboard", () => {
  it("ranks submitted entries by real slate snapshot totals", () => {
    const entries = [entry("a", "user-a"), entry("b", "user-b"), entry("c", "user-c")];
    const slots = [
      slot("a", "user-a", "player-a"),
      slot("b", "user-b", "player-b"),
      slot("c", "user-c", "player-c"),
    ];
    const memberships = entries.map(
      (item, index) =>
        ({
          id: `team-${index}`,
          league_id: "league",
          user_id: item.user_id,
          role: index === 0 ? "commissioner" : "manager",
          display_name: `Manager ${index}`,
          team_name: `Team ${index}`,
          joined_at: "2026-01-01T00:00:00Z",
        }) satisfies FantasyLeagueMembershipRecord
    );
    const snapshots = [
      { player_id: "player-a", points: 7 },
      { player_id: "player-b", points: 15 },
      { player_id: "player-c", points: 11 },
    ].map((row) => ({
      ...row,
      match_id: "match",
      match_date_utc: "2026-07-22T20:00:00Z",
      breakdown: {},
      is_approximated: false,
    }));

    const result = buildSalaryCapLeaderboard(
      entries,
      slots,
      memberships,
      snapshots,
      slate,
      new Date("2026-07-22T21:00:00Z")
    );

    expect(result.entries.map((row) => [row.entry_id, row.total_points])).toEqual([
      ["b", 15],
      ["c", 11],
      ["a", 7],
    ]);
  });
});
