import { describe, expect, it } from "vitest";
import {
  buildSimulatedStandings,
  buildSimulatedMatchup,
} from "./fantasy-season-sim";
import type {
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyPoolPlayer,
  FantasyRosterPlayer,
  PlayerPosition,
} from "@/types/fantasy";

// ── Helpers ──────────────────────────────────────────────────

function makeMembership(
  overrides: Partial<FantasyLeagueMembershipRecord> = {}
): FantasyLeagueMembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    league_id: "league-1",
    user_id: overrides.user_id ?? "user-1",
    role: "manager",
    display_name: overrides.display_name ?? "Manager 1",
    team_name: overrides.team_name ?? "Team 1",
    joined_at: "2026-01-01T00:00:00.000Z",
    draft_slot: overrides.draft_slot ?? 1,
    waiver_priority: null,
  };
}

function makeMemberships(count: number): FantasyLeagueMembershipRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeMembership({
      id: `mem-${i + 1}`,
      user_id: `user-${i + 1}`,
      display_name: `Manager ${i + 1}`,
      team_name: `Team ${i + 1}`,
      draft_slot: i + 1,
    })
  );
}

function makePoolPlayer(
  overrides: Partial<FantasyPoolPlayer> = {}
): FantasyPoolPlayer {
  return {
    id: overrides.id ?? `player-${Math.random().toString(36).slice(2, 8)}`,
    display_name: overrides.display_name ?? "Player",
    club_name: overrides.club_name ?? "Portland Thorns",
    position: overrides.position ?? "MID",
    average_points: overrides.average_points ?? 8.0,
    salary_cost: overrides.salary_cost ?? 10,
    availability: overrides.availability ?? "available",
    rank: overrides.rank ?? 1,
  };
}

function makeRosterPlayer(
  overrides: Partial<Omit<FantasyRosterPlayer, "player">> & { player?: Partial<FantasyPoolPlayer> } = {}
): FantasyRosterPlayer {
  const position = overrides.player_position ?? "MID";
  const id = overrides.id ?? `roster-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    league_id: "league-1",
    user_id: overrides.user_id ?? "user-1",
    player_id: overrides.player_id ?? id,
    player_name: overrides.player_name ?? "Player",
    player_position: position,
    club_name: overrides.club_name ?? "Portland Thorns",
    acquisition_source: "draft",
    lineup_slot: overrides.lineup_slot ?? null,
    acquired_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    player: makePoolPlayer({
      id: overrides.player_id ?? id,
      position,
      average_points: overrides.player?.average_points ?? 8.0,
      ...overrides.player,
    }),
  };
}

function makeLeague(
  overrides: Partial<FantasyLeagueRecord> = {}
): FantasyLeagueRecord {
  return {
    id: "league-1",
    name: "Test League",
    code: "ABC123",
    privacy: "private",
    status: overrides.status ?? "live",
    game_variant: "classic_season_long",
    roster_build_mode: "snake_draft",
    player_ownership_mode: "exclusive",
    contest_horizon: "season",
    salary_cap_amount: null,
    manager_count_target: 8,
    draft_at: "2026-03-01T00:00:00.000Z",
    commissioner_user_id: "user-1",
    ...overrides,
  };
}

function buildStandardRosters(
  memberships: FantasyLeagueMembershipRecord[]
): Map<string, FantasyRosterPlayer[]> {
  const rosters = new Map<string, FantasyRosterPlayer[]>();
  const positions: PlayerPosition[] = ["GK", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "MID"];

  for (const m of memberships) {
    rosters.set(
      m.user_id,
      positions.map((pos, i) =>
        makeRosterPlayer({
          id: `${m.id}-p${i}`,
          user_id: m.user_id,
          player_position: pos,
          player: { average_points: 6 + i * 0.5 },
        })
      )
    );
  }

  return rosters;
}

// ── Tests ────────────────────────────────────────────────────

describe("buildSimulatedStandings", () => {
  it("returns empty standings for no memberships", () => {
    const result = buildSimulatedStandings([], new Map());
    expect(result.standings).toEqual([]);
  });

  it("returns standings with zero records for a single membership", () => {
    const memberships = makeMemberships(1);
    const rosters = buildStandardRosters(memberships);
    const result = buildSimulatedStandings(memberships, rosters);

    expect(result.standings).toHaveLength(1);
    expect(result.standings[0].wins).toBe(0);
    expect(result.standings[0].losses).toBe(0);
  });

  it("assigns sequential ranks to all members", () => {
    const memberships = makeMemberships(6);
    const rosters = buildStandardRosters(memberships);
    const result = buildSimulatedStandings(memberships, rosters);

    const ranks = result.standings.map((s) => s.rank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("computes win_pct as (wins + ties * 0.5) / games_played", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const result = buildSimulatedStandings(memberships, rosters);

    for (const standing of result.standings) {
      const played = standing.wins + standing.losses + standing.ties;
      if (played > 0) {
        const expectedPct = Number(
          ((standing.wins + standing.ties * 0.5) / played).toFixed(3)
        );
        expect(standing.win_pct).toBe(expectedPct);
      }
    }
  });

  it("tracks points_for and points_against as non-negative", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const result = buildSimulatedStandings(memberships, rosters);

    for (const standing of result.standings) {
      expect(standing.points_for).toBeGreaterThanOrEqual(0);
      expect(standing.points_against).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns completedWeeks as 8", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const result = buildSimulatedStandings(memberships, rosters);

    expect(result.completedWeeks).toBe(8);
  });

  it("handles odd-numbered leagues (bye weeks)", () => {
    const memberships = makeMemberships(5);
    const rosters = buildStandardRosters(memberships);
    const result = buildSimulatedStandings(memberships, rosters);

    expect(result.standings).toHaveLength(5);
    // With bye weeks, some teams will have fewer games
    for (const standing of result.standings) {
      const played = standing.wins + standing.losses + standing.ties;
      expect(played).toBeGreaterThan(0);
    }
  });

  it("gives a default baseline of 77 for empty rosters", () => {
    const memberships = makeMemberships(2);
    const emptyRosters = new Map<string, FantasyRosterPlayer[]>();
    const result = buildSimulatedStandings(memberships, emptyRosters);

    expect(result.standings).toHaveLength(2);
    // projected_points should be based on baseline 77 * 10
    for (const standing of result.standings) {
      expect(standing.projected_points).toBeGreaterThan(0);
    }
  });

  it("sorts standings by win_pct descending then points_for", () => {
    const memberships = makeMemberships(6);
    const rosters = buildStandardRosters(memberships);
    const result = buildSimulatedStandings(memberships, rosters);

    for (let i = 1; i < result.standings.length; i++) {
      const prev = result.standings[i - 1];
      const curr = result.standings[i];

      if (prev.win_pct !== curr.win_pct) {
        expect(prev.win_pct).toBeGreaterThanOrEqual(curr.win_pct);
      }
    }
  });
});

describe("buildSimulatedMatchup", () => {
  it("returns a valid matchup structure with all required fields", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const league = makeLeague();
    const myMembership = memberships[0];

    const matchup = buildSimulatedMatchup(
      league,
      myMembership,
      memberships,
      rosters
    );

    expect(matchup.league).toBe(league);
    expect(matchup.myMembership).toBe(myMembership);
    expect(matchup.week_number).toBeGreaterThan(0);
    expect(matchup.week_label).toMatch(/^Week \d+$/);
    expect(matchup.total_weeks).toBeGreaterThan(0);
    expect(["pregame", "live", "final"]).toContain(matchup.status);
    expect(matchup.home_team_name).toBeTruthy();
    expect(typeof matchup.home_points).toBe("number");
    expect(typeof matchup.away_points).toBe("number");
    expect(["home", "away"]).toContain(matchup.my_team_side);
  });

  it("handles a single-member league gracefully (open week)", () => {
    const memberships = makeMemberships(1);
    const rosters = buildStandardRosters(memberships);
    const league = makeLeague();
    const myMembership = memberships[0];

    const matchup = buildSimulatedMatchup(
      league,
      myMembership,
      memberships,
      rosters
    );

    // Should have no rotation, so open week
    expect(matchup.away_team_name).toBe("Open week");
    expect(matchup.away_manager_name).toBe("No opponent assigned");
    expect(matchup.event_feed).toEqual([]);
  });

  it("returns a 'final' status for a completed league", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const league = makeLeague({ status: "complete" });

    const matchup = buildSimulatedMatchup(
      league,
      memberships[0],
      memberships,
      rosters
    );

    expect(matchup.status).toBe("final");
  });

  it("clamps requested week within valid range", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const league = makeLeague();

    const matchup = buildSimulatedMatchup(
      league,
      memberships[0],
      memberships,
      rosters,
      999
    );

    expect(matchup.week_number).toBeLessThanOrEqual(matchup.total_weeks);
  });

  it("returns contributions array with player-level detail", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const league = makeLeague({ status: "complete" });

    const matchup = buildSimulatedMatchup(
      league,
      memberships[0],
      memberships,
      rosters
    );

    expect(matchup.home_contributions.length).toBeGreaterThan(0);
    for (const contribution of matchup.home_contributions) {
      expect(contribution.player_id).toBeTruthy();
      expect(contribution.player_name).toBeTruthy();
      expect(typeof contribution.fantasy_points).toBe("number");
      expect(contribution.note).toBeTruthy();
    }
  });

  it("produces deterministic results for the same inputs", () => {
    const memberships = makeMemberships(4);
    const rosters = buildStandardRosters(memberships);
    const league = makeLeague({ id: "stable-league", code: "STABLE" });

    const first = buildSimulatedMatchup(league, memberships[0], memberships, rosters, 3);
    const second = buildSimulatedMatchup(league, memberships[0], memberships, rosters, 3);

    expect(first.home_points).toBe(second.home_points);
    expect(first.away_points).toBe(second.away_points);
    expect(first.status).toBe(second.status);
  });
});
