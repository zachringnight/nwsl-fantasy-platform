import { describe, expect, it } from "vitest";
import {
  crosswalkOfficialMatchesToEspn,
  mapNwslPublicRows,
  normalizeNwslTeamKey,
  validateNwslPublicRows,
  type NwslPublicRow,
  type NwslPublicRows,
} from "./nwsl-public-data-mapper";

const runId = "00000000-0000-4000-8000-000000000026";
const washingtonId = "nwsl::Football_Team::washington";
const portlandId = "nwsl::Football_Team::portland";
const officialMatchId = "nwsl::Football_Match::opening";
const playerId = "1234567890abcdef1234567890abcdef";

function fixtureRows(): NwslPublicRows {
  const teams: NwslPublicRow[] = [
    {
      id: washingtonId,
      slug: "washington-spirit",
      media_name: "Washington Spirit",
      abbreviation: "WAS",
      data_run_id: runId,
    },
    {
      id: portlandId,
      slug: "portland-thorns",
      media_name: "Portland Thorns",
      abbreviation: "POR",
      data_run_id: runId,
    },
  ];
  const matches: NwslPublicRow[] = [
    {
      id: officialMatchId,
      kickoff_at: "2026-03-14T00:00:00Z",
      local_date: "2026-03-13",
      status: "FINISHED",
      home_team_id: washingtonId,
      away_team_id: portlandId,
      home_score: 0,
      away_score: 1,
      venue: "Audi Field",
      data_run_id: runId,
    },
  ];

  return {
    run: {
      id: runId,
      source_url: "https://www.nwslsoccer.com/",
      generated_at: "2026-07-26T20:00:00Z",
      published_at: "2026-07-26T20:01:00Z",
      payload_checksum: "abc123",
      teams_count: 2,
      players_count: 1,
      matches_count: 1,
      player_season_stats_count: 1,
      team_season_stats_count: 2,
      player_match_stats_count: 1,
    },
    teams,
    players: [
      {
        id: playerId,
        official_id: `nwsl::Football_Player::${playerId}`,
        display_name: "Transfer Player",
        current_team_id: portlandId,
        position: "MID",
        data_run_id: runId,
      },
    ],
    matches,
    playerSeasonStats: [
      {
        player_id: playerId,
        team_id: washingtonId,
        games_played: 1,
        starts: 1,
        minutes_played: 90,
        goals: 1,
        assists: 0,
        shots: 2,
        shots_on_target: 1,
        passes_attempted: 40,
        passes_completed: 32,
        pass_accuracy_pct: 80,
        tackles_won: 2,
        fantasy_points: 15,
        points_per_90: 15,
        match_stats_appearances: 1,
        match_stats_complete: true,
      },
    ],
    teamSeasonStats: teams.map((team, index) => ({
      team_id: team.id,
      games_played: 1,
      wins: index,
      draws: 0,
      losses: 1 - index,
      points: index * 3,
      goals_for: index,
      goals_against: 1 - index,
      goal_difference: index ? 1 : -1,
    })),
    playerMatchStats: [
      {
        player_id: playerId,
        match_id: officialMatchId,
        team_id: portlandId,
        opponent_team_id: washingtonId,
        is_home: false,
        minutes: 90,
        goals: 1,
        assists: 0,
        shots: 2,
        shots_on_target: 1,
        passes_attempted: 40,
        passes_completed: 32,
        pass_accuracy_pct: 80,
        tackles_won: 2,
        fantasy_points: 15,
        fantasy_breakdown: { goals: 8, appearance: 1, minutes60Plus: 1 },
        raw_stats: { total_fouls_won: 2, successful_crosses: 1 },
      },
    ],
  };
}

describe("official NWSL public data mapping", () => {
  it("normalizes official and ESPN team labels for deterministic links", () => {
    expect(normalizeNwslTeamKey("Portland Thorns FC")).toBe(
      normalizeNwslTeamKey("Portland Thorns")
    );
    expect(normalizeNwslTeamKey("Bay FC")).toBe(normalizeNwslTeamKey("Bay"));
  });

  it("crosswalks an official match to the existing ESPN match route", () => {
    const rows = fixtureRows();
    const crosswalk = crosswalkOfficialMatchesToEspn(
      rows.matches,
      new Map([
        [washingtonId, "Washington Spirit"],
        [portlandId, "Portland Thorns"],
      ])
    );

    expect(crosswalk.get(officialMatchId)?.matchId).toBe("401853857");
  });

  it("uses the current roster team after a transfer and preserves exact scoring", () => {
    const mapped = mapNwslPublicRows(fixtureRows());
    const player = mapped.players[0];
    const log = mapped.playerMatchLogs[playerId][0];

    expect(player.teamId).toBe("portland-thorns");
    expect(player.matchStatsAppearances).toBe(1);
    expect(player.matchStatsComplete).toBe(true);
    expect(log.matchId).toBe("401853857");
    expect(log.opponentId).toBe("washington-spirit");
    expect(log.fantasyPoints).toBe(15);
    expect(log.fantasyBreakdown).toEqual({
      goals: 8,
      appearance: 1,
      minutes60Plus: 1,
    });
  });

  it("maps partial player match-log coverage without changing season totals", () => {
    const rows = fixtureRows();
    rows.playerSeasonStats[0].games_played = 8;
    rows.playerSeasonStats[0].match_stats_appearances = 3;
    rows.playerSeasonStats[0].match_stats_complete = false;

    const player = mapNwslPublicRows(rows).players[0];

    expect(player.appearances).toBe(8);
    expect(player.matchStatsAppearances).toBe(3);
    expect(player.matchStatsComplete).toBe(false);
  });

  it("preserves postponed and canceled match states", () => {
    const rows = fixtureRows();
    rows.matches.push(
      {
        ...rows.matches[0],
        id: "nwsl::Football_Match::postponed",
        status: "POSTPONED",
      },
      {
        ...rows.matches[0],
        id: "nwsl::Football_Match::canceled",
        status: "CANCELED",
      }
    );

    const mapped = mapNwslPublicRows(rows);

    expect(
      mapped.matches.find((match) => match.officialMatchId?.endsWith("postponed"))
        ?.status
    ).toBe("postponed");
    expect(
      mapped.matches.find((match) => match.officialMatchId?.endsWith("canceled"))
        ?.status
    ).toBe("canceled");
  });

  it("fails closed when production coverage is incomplete", () => {
    const issues = validateNwslPublicRows(fixtureRows());
    expect(issues).toContain("expected exactly 16 teams");
    expect(issues).toContain("expected at least 440 players");
    expect(issues).toContain("expected at least 240 matches");
  });
});
