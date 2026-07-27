import { z } from "zod";

const PLAYER_ID_PATTERN = /^[0-9a-f]{32}$/;
const OFFICIAL_PLAYER_ID_PATTERN =
  /^nwsl::Football_Player::[0-9a-f]{32}$/;
const TEAM_ID_PATTERN = /^nwsl::Football_Team::[0-9a-f]{32}$/;
const MATCH_ID_PATTERN = /^nwsl::Football_Match::[0-9a-f]{32}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const playerId = z.string().regex(PLAYER_ID_PATTERN);
const officialPlayerId = z.string().regex(OFFICIAL_PLAYER_ID_PATTERN);
const teamId = z.string().regex(TEAM_ID_PATTERN);
const matchId = z.string().regex(MATCH_ID_PATTERN);
const slug = z.string().min(1).max(160).regex(SLUG_PATTERN);
const boundedText = z.string().min(1).max(240);
const optionalText = z.string().max(240).nullable();
const timestamp = z.string().datetime({ offset: true });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().min(0).max(100_000);
const metric = z.number().finite().min(0).max(100_000);
const signedMetric = z.number().finite().min(-100_000).max(100_000);
const percentage = z.number().finite().min(0).max(100).nullable();
const expectedMetric = z.number().finite().min(0).max(1_000).nullable();
const nullableUrl = z.string().url().max(2_048).nullable();

const rawStatValue = z.union([
  z.number().finite(),
  z.string().max(1_000),
  z.boolean(),
  z.null(),
]);

const rawStats = z
  .record(z.string().min(1).max(120), rawStatValue)
  .superRefine((value, context) => {
    if (Object.keys(value).length > 400) {
      context.addIssue({
        code: "custom",
        message: "rawStats may contain at most 400 fields",
      });
    }
  });

const metadataValue = z.union([
  z.number().finite(),
  z.string().max(2_000),
  z.boolean(),
  z.null(),
]);

const metadata = z
  .record(z.string().min(1).max(120), metadataValue)
  .superRefine((value, context) => {
    if (Object.keys(value).length > 100) {
      context.addIssue({
        code: "custom",
        message: "metadata may contain at most 100 fields",
      });
    }
  });

const fantasyBreakdown = z
  .record(
    z.string().min(1).max(120),
    z.number().finite().min(-10_000).max(10_000)
  )
  .superRefine((value, context) => {
    if (Object.keys(value).length > 100) {
      context.addIssue({
        code: "custom",
        message: "fantasyBreakdown may contain at most 100 fields",
      });
    }
  });

export const nwslTeamPayloadSchema = z
  .object({
    id: teamId,
    providerId: z.string().min(1).max(160),
    slug,
    name: boundedText,
    abbreviation: z.string().min(2).max(8).regex(/^[A-Z0-9]+$/),
    mediaName: optionalText,
    websiteUrl: nullableUrl,
    isActive: z.boolean(),
  })
  .strict();

export const nwslPlayerPayloadSchema = z
  .object({
    id: playerId,
    officialId: officialPlayerId,
    providerId: z.string().min(1).max(160),
    slug,
    displayName: boundedText,
    firstName: z.string().max(120).nullable(),
    lastName: z.string().max(120).nullable(),
    currentTeamId: teamId,
    position: z.enum(["GK", "DEF", "MID", "FWD"]),
    playerStatus: z.enum(["active", "left_team"]),
    jerseyNumber: z.number().int().min(0).max(999).nullable(),
    dateOfBirth: dateOnly.nullable(),
    nationality: z.string().max(120).nullable(),
    nationalityCode: z.string().max(8).nullable(),
  })
  .strict();

export const nwslMatchPayloadSchema = z
  .object({
    id: matchId,
    providerId: z.string().min(1).max(160),
    status: z.enum([
      "UPCOMING",
      "LIVE",
      "FINISHED",
      "POSTPONED",
      "CANCELED",
    ]),
    phase: z.string().max(80).nullable(),
    kickoffAt: timestamp,
    localDate: dateOnly.nullable(),
    homeTeamId: teamId,
    awayTeamId: teamId,
    homeScore: z.number().int().min(0).max(99).nullable(),
    awayScore: z.number().int().min(0).max(99).nullable(),
    venue: z.string().max(240).nullable(),
    city: z.string().max(240).nullable(),
    roundName: z.string().max(160).nullable(),
    matchWeek: z.number().int().min(0).max(99).nullable(),
  })
  .strict();

export const nwslPlayerSeasonStatsPayloadSchema = z
  .object({
    playerId,
    teamId,
    gamesPlayed: count,
    matchStatsAppearances: count,
    matchStatsComplete: z.boolean(),
    starts: count,
    minutesPlayed: metric,
    goals: count,
    assists: count,
    shots: count,
    shotsOnTarget: count,
    xg: expectedMetric,
    xa: expectedMetric,
    passesAttempted: count,
    passesCompleted: count,
    passAccuracyPct: percentage,
    chancesCreated: count,
    tackles: count,
    tacklesWon: count,
    interceptions: count,
    clearances: count,
    cleanSheets: count,
    saves: count,
    goalsConceded: count,
    yellowCards: count,
    redCards: count,
    fantasyPoints: signedMetric,
    pointsPer90: signedMetric,
    rawStats,
  })
  .strict();

export const nwslTeamSeasonStatsPayloadSchema = z
  .object({
    teamId,
    gamesPlayed: count,
    wins: count,
    draws: count,
    losses: count,
    points: count,
    goalsFor: count,
    goalsAgainst: count,
    goalDifference: z.number().int().min(-999).max(999),
    cleanSheets: count,
    shots: count,
    shotsOnTarget: count,
    xg: expectedMetric,
    xga: expectedMetric,
    possessionPct: percentage,
    passesAttempted: count,
    passesCompleted: count,
    passAccuracyPct: percentage,
    chancesCreated: count,
    tackles: count,
    tacklesWon: count,
    interceptions: count,
    yellowCards: count,
    redCards: count,
    corners: count,
    rawStats,
  })
  .strict();

export const nwslPlayerMatchStatsPayloadSchema = z
  .object({
    playerId,
    matchId,
    teamId,
    opponentTeamId: teamId,
    isHome: z.boolean(),
    minutes: metric,
    goals: count,
    assists: count,
    shots: count,
    shotsOnTarget: count,
    xg: expectedMetric,
    passesAttempted: count,
    passesCompleted: count,
    passAccuracyPct: percentage,
    chancesCreated: count,
    tackles: count,
    tacklesWon: count,
    interceptions: count,
    clearances: count,
    saves: count,
    goalsConceded: count,
    yellowCards: count,
    redCards: count,
    fantasyPoints: signedMetric,
    fantasyBreakdown,
    rawStats,
  })
  .strict();

export const nwslDataPublishPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    season: z.literal(2026),
    run: z
      .object({
        runKey: z
          .string()
          .min(1)
          .max(320)
          .regex(/^nwsl-data:2026:[A-Za-z0-9._:+-]+$/),
        seasonId: z
          .string()
          .regex(/^nwsl::Football_Season::[0-9a-f]{32}$/),
        sourceProvider: z.literal("nwsl_official"),
        sourceUrl: z.string().url().max(2_048),
        generatedAt: timestamp,
        fetchedAt: timestamp,
        metadata,
      })
      .strict(),
    teams: z.array(nwslTeamPayloadSchema).max(20),
    players: z.array(nwslPlayerPayloadSchema).max(700),
    matches: z.array(nwslMatchPayloadSchema).max(350),
    playerSeasonStats: z
      .array(nwslPlayerSeasonStatsPayloadSchema)
      .max(700),
    teamSeasonStats: z.array(nwslTeamSeasonStatsPayloadSchema).max(20),
    playerMatchStats: z
      .array(nwslPlayerMatchStatsPayloadSchema)
      .max(12_000),
  })
  .strict();

export type NwslDataPublishPayload = z.infer<
  typeof nwslDataPublishPayloadSchema
>;

export const nwslDataPublicationResultSchema = z
  .object({
    runId: z.string().uuid(),
    runKey: z.string().min(1).max(320),
    season: z.literal(2026),
    payloadChecksum: z.string().regex(/^[0-9a-f]{64}$/),
    idempotent: z.boolean(),
    counts: z
      .object({
        teams: z.literal(16),
        players: z.number().int().min(440).max(700),
        matches: z.number().int().min(240).max(350),
        playerSeasonStats: z.number().int().min(430).max(700),
        teamSeasonStats: z.literal(16),
        playerMatchStats: z.number().int().min(0).max(12_000),
        finishedMatches: z.number().int().min(0).max(350),
      })
      .strict(),
  })
  .strict();

export type NwslDataPublicationResult = z.infer<
  typeof nwslDataPublicationResultSchema
>;

export function validateNwslDataPublishInvariants(
  payload: NwslDataPublishPayload,
  now = Date.now()
): string[] {
  const errors: string[] = [];

  if (payload.teams.length !== 16) {
    errors.push("snapshot must contain exactly 16 teams");
  }
  if (payload.players.length < 440) {
    errors.push("snapshot must contain at least 440 players");
  }
  if (payload.matches.length < 240) {
    errors.push("snapshot must contain at least 240 matches");
  }
  if (payload.playerSeasonStats.length < 430) {
    errors.push("snapshot must contain at least 430 player season rows");
  }
  if (payload.teamSeasonStats.length !== 16) {
    errors.push("snapshot must contain exactly 16 team season rows");
  }

  const duplicateValues = (
    values: string[],
    label: string
  ): Set<string> => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    if (duplicates.size > 0) {
      errors.push(`snapshot contains duplicate ${label}`);
    }
    return seen;
  };

  const teamIds = duplicateValues(
    payload.teams.map((team) => team.id),
    "team IDs"
  );
  duplicateValues(
    payload.teams.map((team) => team.slug),
    "team slugs"
  );

  const playerIds = duplicateValues(
    payload.players.map((player) => player.id),
    "player IDs"
  );
  duplicateValues(
    payload.players.map((player) => player.officialId),
    "official player IDs"
  );
  duplicateValues(
    payload.players.map((player) => player.slug),
    "player slugs"
  );

  for (const player of payload.players) {
    if (player.officialId !== `nwsl::Football_Player::${player.id}`) {
      errors.push(`player ${player.id} official ID does not match its route ID`);
    }
    if (!teamIds.has(player.currentTeamId)) {
      errors.push(`player ${player.id} references an unresolved team`);
    }
  }

  const matchIds = duplicateValues(
    payload.matches.map((match) => match.id),
    "match IDs"
  );
  for (const match of payload.matches) {
    if (
      !teamIds.has(match.homeTeamId) ||
      !teamIds.has(match.awayTeamId) ||
      match.homeTeamId === match.awayTeamId
    ) {
      errors.push(`match ${match.id} has unresolved or invalid teams`);
    }
    if (
      match.status === "FINISHED" &&
      (match.homeScore === null || match.awayScore === null)
    ) {
      errors.push(`finished match ${match.id} is missing its final score`);
    }
  }

  const playerSeasonKeys = duplicateValues(
    payload.playerSeasonStats.map((row) => row.playerId),
    "player season rows"
  );
  for (const row of payload.playerSeasonStats) {
    if (!playerIds.has(row.playerId) || !teamIds.has(row.teamId)) {
      errors.push(
        `player season row ${row.playerId} contains an unresolved reference`
      );
    }
    if (row.passesCompleted > row.passesAttempted) {
      errors.push(
        `player season row ${row.playerId} has more completed than attempted passes`
      );
    }
  }
  if (playerSeasonKeys.size !== payload.playerSeasonStats.length) {
    // duplicateValues already added the reader-facing error.
  }

  const teamSeasonKeys = duplicateValues(
    payload.teamSeasonStats.map((row) => row.teamId),
    "team season rows"
  );
  for (const row of payload.teamSeasonStats) {
    if (!teamIds.has(row.teamId)) {
      errors.push(`team season row ${row.teamId} is unresolved`);
    }
    if (row.wins + row.draws + row.losses !== row.gamesPlayed) {
      errors.push(`team season row ${row.teamId} has an invalid record`);
    }
    if (row.passesCompleted > row.passesAttempted) {
      errors.push(
        `team season row ${row.teamId} has more completed than attempted passes`
      );
    }
  }
  if (
    payload.teams.length === 16 &&
    (teamSeasonKeys.size !== 16 ||
      [...teamIds].some((id) => !teamSeasonKeys.has(id)))
  ) {
    errors.push("team season rows do not cover every team");
  }

  const matchesById = new Map(
    payload.matches.map((match) => [match.id, match])
  );
  const playerMatchKeys = duplicateValues(
    payload.playerMatchStats.map(
      (row) => `${row.playerId}\u0000${row.matchId}`
    ),
    "player-match rows"
  );
  const coveredFinishedMatches = new Set<string>();
  const playerMatchCounts = new Map<string, number>();
  const playerMatchFantasyTotals = new Map<string, number>();

  const metricsMatch = (left: number, right: number): boolean =>
    Math.abs(left - right) <= 0.000_001;

  for (const row of payload.playerMatchStats) {
    const match = matchesById.get(row.matchId);
    if (
      !playerIds.has(row.playerId) ||
      !matchIds.has(row.matchId) ||
      !teamIds.has(row.teamId) ||
      !teamIds.has(row.opponentTeamId)
    ) {
      errors.push(
        `player-match row ${row.playerId}/${row.matchId} contains an unresolved reference`
      );
      continue;
    }
    if (!match || match.status !== "FINISHED") {
      errors.push(
        `player-match row ${row.playerId}/${row.matchId} is not tied to a finished match`
      );
      continue;
    }

    const expectedTeamId = row.isHome
      ? match.homeTeamId
      : match.awayTeamId;
    const expectedOpponentId = row.isHome
      ? match.awayTeamId
      : match.homeTeamId;
    if (
      row.teamId !== expectedTeamId ||
      row.opponentTeamId !== expectedOpponentId
    ) {
      errors.push(
        `player-match row ${row.playerId}/${row.matchId} has invalid sides`
      );
    }
    if (row.passesCompleted > row.passesAttempted) {
      errors.push(
        `player-match row ${row.playerId}/${row.matchId} has more completed than attempted passes`
      );
    }

    const breakdownTotal = Object.values(row.fantasyBreakdown).reduce(
      (total, value) => total + value,
      0
    );
    if (!metricsMatch(breakdownTotal, row.fantasyPoints)) {
      errors.push(
        `player-match row ${row.playerId}/${row.matchId} fantasyBreakdown does not sum to fantasyPoints`
      );
    }

    if (!playerSeasonKeys.has(row.playerId)) {
      errors.push(
        `player-match row ${row.playerId}/${row.matchId} has no player season row`
      );
    }

    playerMatchCounts.set(
      row.playerId,
      (playerMatchCounts.get(row.playerId) ?? 0) + 1
    );
    playerMatchFantasyTotals.set(
      row.playerId,
      (playerMatchFantasyTotals.get(row.playerId) ?? 0) + row.fantasyPoints
    );
    coveredFinishedMatches.add(row.matchId);
  }
  if (playerMatchKeys.size !== payload.playerMatchStats.length) {
    // duplicateValues already added the reader-facing error.
  }

  const finishedMatchIds = payload.matches
    .filter((match) => match.status === "FINISHED")
    .map((match) => match.id);
  const missingFinishedMatches = finishedMatchIds.filter(
    (id) => !coveredFinishedMatches.has(id)
  );
  if (missingFinishedMatches.length > 0) {
    errors.push(
      `player-match stats are missing ${missingFinishedMatches.length} finished matches`
    );
  }

  for (const row of payload.playerSeasonStats) {
    const publishedMatches = playerMatchCounts.get(row.playerId) ?? 0;
    if (publishedMatches !== row.matchStatsAppearances) {
      errors.push(
        `player season row ${row.playerId} matchStatsAppearances does not match its match-row count`
      );
    }
    if (row.matchStatsAppearances > row.gamesPlayed) {
      errors.push(
        `player season row ${row.playerId} matchStatsAppearances exceeds gamesPlayed`
      );
    }
    if (
      row.matchStatsComplete !==
      (row.matchStatsAppearances === row.gamesPlayed)
    ) {
      errors.push(
        `player season row ${row.playerId} matchStatsComplete does not match coverage`
      );
    }

    const publishedFantasyPoints =
      playerMatchFantasyTotals.get(row.playerId) ?? 0;
    if (!metricsMatch(publishedFantasyPoints, row.fantasyPoints)) {
      errors.push(
        `player season row ${row.playerId} fantasyPoints does not match its match-row total`
      );
    }
  }

  const generatedAt = Date.parse(payload.run.generatedAt);
  const fetchedAt = Date.parse(payload.run.fetchedAt);
  const futureLimit = now + 10 * 60 * 1_000;
  const staleLimit = now - 48 * 60 * 60 * 1_000;

  if (!Number.isFinite(generatedAt)) {
    errors.push("run generatedAt is invalid");
  } else if (generatedAt > futureLimit) {
    errors.push("run generatedAt is too far in the future");
  } else if (generatedAt < staleLimit) {
    errors.push("run is too old to publish");
  }

  if (!Number.isFinite(fetchedAt)) {
    errors.push("run fetchedAt is invalid");
  } else if (fetchedAt > futureLimit) {
    errors.push("run fetchedAt is too far in the future");
  } else if (fetchedAt < staleLimit) {
    errors.push("source data is too old to publish");
  }

  if (
    Number.isFinite(generatedAt) &&
    Number.isFinite(fetchedAt) &&
    fetchedAt > generatedAt + 10 * 60 * 1_000
  ) {
    errors.push("source fetch time is later than the generated run");
  }

  return [...new Set(errors)];
}
