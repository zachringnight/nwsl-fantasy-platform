import { describe, expect, it } from "vitest";
import {
  buildRealMatchup,
  buildRealStandings,
  type FantasyPointSnapshot,
} from "./fantasy-standings";
import type {
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyRosterSlotRecord,
  FantasySlateWindow,
} from "@/types/fantasy";

const memberships: FantasyLeagueMembershipRecord[] = [
  {
    id: "team-a",
    league_id: "league",
    user_id: "user-a",
    role: "commissioner",
    display_name: "Ava",
    team_name: "A Team",
    joined_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "team-b",
    league_id: "league",
    user_id: "user-b",
    role: "manager",
    display_name: "Bea",
    team_name: "B Team",
    joined_at: "2026-01-01T00:00:00Z",
  },
];

const rosterSlots: FantasyRosterSlotRecord[] = [
  {
    id: "slot-a",
    league_id: "league",
    user_id: "user-a",
    player_id: "player-a",
    player_name: "Player A",
    player_position: "FWD",
    club_name: "Club A",
    acquisition_source: "draft",
    lineup_slot: "FWD_1",
    acquired_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "slot-b",
    league_id: "league",
    user_id: "user-b",
    player_id: "player-b",
    player_name: "Player B",
    player_position: "MID",
    club_name: "Club B",
    acquisition_source: "draft",
    lineup_slot: "MID_1",
    acquired_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const window: FantasySlateWindow = {
  key: "week-01",
  label: "Week 1",
  cadence: "weekly",
  starts_at: "2026-03-13T00:00:00Z",
  lock_at: "2026-03-13T00:00:00Z",
  ends_at: "2026-03-16T23:59:59Z",
  match_count: 1,
  slate_keys: ["2026-03-14"],
};

const league: FantasyLeagueRecord = {
  id: "league",
  name: "Test League",
  code: "TEST",
  privacy: "private",
  status: "ready",
  game_variant: "classic_season_long",
  roster_build_mode: "snake_draft",
  player_ownership_mode: "exclusive",
  contest_horizon: "season",
  salary_cap_amount: null,
  manager_count_target: 2,
  draft_at: "2026-03-01T00:00:00Z",
  commissioner_user_id: "user-a",
};

describe("real fantasy standings", () => {
  it("ranks teams from real starter snapshots", () => {
    const snapshots: FantasyPointSnapshot[] = [
      {
        player_id: "player-a",
        match_id: "match",
        match_date_utc: "2026-03-14T20:00:00Z",
        points: 12,
        breakdown: { goals: 8, assists: 4 },
        is_approximated: true,
      },
      {
        player_id: "player-b",
        match_id: "match",
        match_date_utc: "2026-03-14T20:00:00Z",
        points: 8,
        breakdown: { goals: 8 },
        is_approximated: false,
      },
    ];

    const result = buildRealStandings(
      memberships,
      rosterSlots,
      snapshots,
      [window],
      new Date("2026-03-17T00:00:00Z")
    );

    expect(result.completedWeeks).toBe(1);
    expect(result.standings[0]).toMatchObject({
      membership_id: "team-a",
      wins: 1,
      losses: 0,
      points_for: 12,
      points_against: 8,
      is_approximated: true,
    });
    expect(result.standings[1]).toMatchObject({
      membership_id: "team-b",
      wins: 0,
      losses: 1,
      points_for: 8,
      points_against: 12,
    });
  });

  it("returns an honest zero-score matchup when no snapshots exist", () => {
    const result = buildRealMatchup(
      league,
      memberships[0]!,
      memberships,
      rosterSlots,
      [],
      [window],
      1,
      new Date("2026-03-17T00:00:00Z")
    );

    expect(result.status).toBe("final");
    expect(result.status_label).toContain("no snapshots");
    expect(result.home_points).toBe(0);
    expect(result.away_points).toBe(0);
    expect(result.event_feed).toEqual([]);
  });
});
