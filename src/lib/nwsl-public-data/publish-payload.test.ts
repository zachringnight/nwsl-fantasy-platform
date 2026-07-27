import { describe, expect, it } from "vitest";
import {
  nwslDataPublishPayloadSchema,
  type NwslDataPublishPayload,
  validateNwslDataPublishInvariants,
} from "./publish-payload";

const NOW = Date.parse("2026-07-26T18:00:00.000Z");

function suffix(value: number): string {
  return value.toString(16).padStart(32, "0");
}

function teamId(value: number): string {
  return `nwsl::Football_Team::${suffix(value)}`;
}

function playerId(value: number): string {
  return suffix(1_000 + value);
}

function matchId(value: number): string {
  return `nwsl::Football_Match::${suffix(2_000 + value)}`;
}

function validPayload(): NwslDataPublishPayload {
  const generatedAt = new Date(NOW).toISOString();
  const teams = Array.from({ length: 16 }, (_, index) => ({
    id: teamId(index + 1),
    providerId: `opta:team:${index + 1}`,
    slug: `team-${index + 1}`,
    name: `Team ${index + 1}`,
    abbreviation: `T${index + 1}`,
    mediaName: `Team ${index + 1}`,
    websiteUrl: null,
    isActive: true,
  }));
  const players = Array.from({ length: 440 }, (_, index) => ({
    id: playerId(index),
    officialId: `nwsl::Football_Player::${playerId(index)}`,
    providerId: `opta:player:${index + 1}`,
    slug: `player-${index + 1}`,
    displayName: `Player ${index + 1}`,
    firstName: "Player",
    lastName: `${index + 1}`,
    currentTeamId: teams[index % teams.length].id,
    position: (["GK", "DEF", "MID", "FWD"] as const)[index % 4],
    playerStatus: "active" as const,
    jerseyNumber: index % 100,
    dateOfBirth: null,
    nationality: null,
    nationalityCode: null,
  }));
  const matches = Array.from({ length: 240 }, (_, index) => ({
    id: matchId(index),
    providerId: `opta:match:${index + 1}`,
    status: index === 0 ? ("FINISHED" as const) : ("UPCOMING" as const),
    phase: index === 0 ? "FULL_TIME" : null,
    kickoffAt: new Date(NOW + index * 86_400_000).toISOString(),
    localDate: "2026-07-26",
    homeTeamId: teams[index % teams.length].id,
    awayTeamId: teams[(index + 1) % teams.length].id,
    homeScore: index === 0 ? 1 : null,
    awayScore: index === 0 ? 0 : null,
    venue: null,
    city: null,
    roundName: null,
    matchWeek: null,
  }));
  const playerSeasonStats = players.slice(0, 430).map((player) => ({
    playerId: player.id,
    teamId: player.currentTeamId,
    gamesPlayed: 0,
    matchStatsAppearances: 0,
    matchStatsComplete: true,
    starts: 0,
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: null,
    xa: null,
    passesAttempted: 0,
    passesCompleted: 0,
    passAccuracyPct: null,
    chancesCreated: 0,
    tackles: 0,
    tacklesWon: 0,
    interceptions: 0,
    clearances: 0,
    cleanSheets: 0,
    saves: 0,
    goalsConceded: 0,
    yellowCards: 0,
    redCards: 0,
    fantasyPoints: 0,
    pointsPer90: 0,
    rawStats: {},
  }));
  playerSeasonStats[0].gamesPlayed = 1;
  playerSeasonStats[0].matchStatsAppearances = 1;
  playerSeasonStats[0].matchStatsComplete = true;
  playerSeasonStats[0].starts = 1;
  playerSeasonStats[0].minutesPlayed = 90;
  playerSeasonStats[0].fantasyPoints = 10;
  playerSeasonStats[0].pointsPer90 = 10;
  const teamSeasonStats = teams.map((team) => ({
    teamId: team.id,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    cleanSheets: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: null,
    xga: null,
    possessionPct: null,
    passesAttempted: 0,
    passesCompleted: 0,
    passAccuracyPct: null,
    chancesCreated: 0,
    tackles: 0,
    tacklesWon: 0,
    interceptions: 0,
    yellowCards: 0,
    redCards: 0,
    corners: 0,
    rawStats: {},
  }));

  return {
    schemaVersion: 1,
    season: 2026,
    run: {
      runKey: `nwsl-data:2026:${generatedAt}`,
      seasonId: `nwsl::Football_Season::${suffix(9_999)}`,
      sourceProvider: "nwsl_official",
      sourceUrl: "https://api-sdp.nwslsoccer.com/v1/nwsl/football",
      generatedAt,
      fetchedAt: generatedAt,
      metadata: {},
    },
    teams,
    players,
    matches,
    playerSeasonStats,
    teamSeasonStats,
    playerMatchStats: [
      {
        playerId: players[0].id,
        matchId: matches[0].id,
        teamId: matches[0].homeTeamId,
        opponentTeamId: matches[0].awayTeamId,
        isHome: true,
        minutes: 90,
        goals: 1,
        assists: 0,
        shots: 2,
        shotsOnTarget: 1,
        xg: 0.4,
        passesAttempted: 20,
        passesCompleted: 18,
        passAccuracyPct: 90,
        chancesCreated: 1,
        tackles: 0,
        tacklesWon: 0,
        interceptions: 0,
        clearances: 0,
        saves: 0,
        goalsConceded: 0,
        yellowCards: 0,
        redCards: 0,
        fantasyPoints: 10,
        fantasyBreakdown: { goal: 10 },
        rawStats: {},
      },
    ],
  };
}

describe("NWSL public data publish payload", () => {
  it("accepts a complete 2026 snapshot", () => {
    const parsed = nwslDataPublishPayloadSchema.parse(validPayload());
    expect(validateNwslDataPublishInvariants(parsed, NOW)).toEqual([]);
  });

  it("rejects snapshots with the wrong protected counts", () => {
    const candidate = validPayload();
    candidate.teams.pop();
    candidate.teamSeasonStats.pop();

    const errors = validateNwslDataPublishInvariants(candidate, NOW);
    expect(errors).toContain("snapshot must contain exactly 16 teams");
    expect(errors).toContain(
      "snapshot must contain exactly 16 team season rows"
    );
  });

  it("rejects malformed official IDs at the schema boundary", () => {
    const candidate: unknown = {
      ...validPayload(),
      teams: [
        { ...validPayload().teams[0], id: "not-an-official-team-id" },
        ...validPayload().teams.slice(1),
      ],
    };

    expect(nwslDataPublishPayloadSchema.safeParse(candidate).success).toBe(
      false
    );
  });

  it("rejects internally inconsistent stat rows", () => {
    const candidate = validPayload();
    candidate.playerSeasonStats[0].passesAttempted = 4;
    candidate.playerSeasonStats[0].passesCompleted = 5;

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player season row ${candidate.playerSeasonStats[0].playerId} has more completed than attempted passes`
    );
  });

  it("rejects missing finished-match coverage", () => {
    const candidate = validPayload();
    candidate.playerMatchStats = [];

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      "player-match stats are missing 1 finished matches"
    );
  });

  it("rejects duplicate player-match rows", () => {
    const candidate = validPayload();
    candidate.playerMatchStats.push({ ...candidate.playerMatchStats[0] });

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      "snapshot contains duplicate player-match rows"
    );
  });

  it("rejects a player match-row count that disagrees with tracked appearances", () => {
    const candidate = validPayload();
    candidate.playerSeasonStats[0].gamesPlayed = 2;
    candidate.playerSeasonStats[0].matchStatsAppearances = 2;

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player season row ${candidate.playerSeasonStats[0].playerId} matchStatsAppearances does not match its match-row count`
    );
  });

  it("rejects tracked appearances greater than gamesPlayed", () => {
    const candidate = validPayload();
    candidate.playerSeasonStats[0].gamesPlayed = 0;

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player season row ${candidate.playerSeasonStats[0].playerId} matchStatsAppearances exceeds gamesPlayed`
    );
  });

  it("rejects a false complete flag when all appearances are tracked", () => {
    const candidate = validPayload();
    candidate.playerSeasonStats[0].matchStatsComplete = false;

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player season row ${candidate.playerSeasonStats[0].playerId} matchStatsComplete does not match coverage`
    );
  });

  it("rejects a true complete flag when coverage is partial", () => {
    const candidate = validPayload();
    candidate.playerSeasonStats[0].gamesPlayed = 2;

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player season row ${candidate.playerSeasonStats[0].playerId} matchStatsComplete does not match coverage`
    );
  });

  it("rejects a season fantasy total that disagrees with match rows", () => {
    const candidate = validPayload();
    candidate.playerSeasonStats[0].fantasyPoints = 11;

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player season row ${candidate.playerSeasonStats[0].playerId} fantasyPoints does not match its match-row total`
    );
  });

  it("rejects a fantasy breakdown that does not sum to the row total", () => {
    const candidate = validPayload();
    candidate.playerMatchStats[0].fantasyBreakdown = { goal: 9 };

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player-match row ${candidate.playerMatchStats[0].playerId}/${candidate.playerMatchStats[0].matchId} fantasyBreakdown does not sum to fantasyPoints`
    );
  });

  it("rejects a player-match row without a corresponding season row", () => {
    const candidate = validPayload();
    const replacementPlayer = candidate.players[439];
    candidate.playerMatchStats[0] = {
      ...candidate.playerMatchStats[0],
      playerId: replacementPlayer.id,
    };
    candidate.playerSeasonStats[0].gamesPlayed = 0;
    candidate.playerSeasonStats[0].matchStatsAppearances = 0;
    candidate.playerSeasonStats[0].matchStatsComplete = true;
    candidate.playerSeasonStats[0].starts = 0;
    candidate.playerSeasonStats[0].minutesPlayed = 0;
    candidate.playerSeasonStats[0].fantasyPoints = 0;
    candidate.playerSeasonStats[0].pointsPer90 = 0;

    expect(validateNwslDataPublishInvariants(candidate, NOW)).toContain(
      `player-match row ${replacementPlayer.id}/${candidate.playerMatchStats[0].matchId} has no player season row`
    );
  });

  it("rejects stale runs", () => {
    const candidate = validPayload();
    candidate.run.generatedAt = new Date(
      NOW - 49 * 60 * 60 * 1_000
    ).toISOString();
    candidate.run.fetchedAt = candidate.run.generatedAt;

    const errors = validateNwslDataPublishInvariants(candidate, NOW);
    expect(errors).toContain("run is too old to publish");
    expect(errors).toContain("source data is too old to publish");
  });
});
