import { getEspnMatches2026, type EspnMatch } from "./espn-data-loader";
import type {
  AnalyticsProvenance,
  FormResult,
  MatchResult,
  PlayerFormPoint,
  PlayerMatchLog,
  PlayerSeasonStats,
  TeamRating,
  TeamStanding,
  TeamStats,
} from "@/types/analytics";
import type { PlayerPosition } from "@/types/fantasy";

export type NwslPublicRow = Record<string, unknown>;

export interface LiveNwslTeam {
  officialId: string;
  teamId: string;
  name: string;
  abbreviation: string;
}

export interface LiveNwslPublicData {
  provenance: AnalyticsProvenance;
  teams: LiveNwslTeam[];
  standings: TeamStanding[];
  teamStats: TeamStats[];
  teamRatings: TeamRating[];
  players: PlayerSeasonStats[];
  matches: MatchResult[];
  playerMatchLogs: Record<string, PlayerMatchLog[]>;
  playerForms: Record<string, PlayerFormPoint[]>;
}

export interface NwslPublicRows {
  run: NwslPublicRow;
  teams: NwslPublicRow[];
  players: NwslPublicRow[];
  matches: NwslPublicRow[];
  playerSeasonStats: NwslPublicRow[];
  teamSeasonStats: NwslPublicRow[];
  playerMatchStats: NwslPublicRow[];
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "yes", "1"].includes(stringValue(value).toLowerCase());
}

function recordValue(value: unknown): NwslPublicRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as NwslPublicRow)
    : {};
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function normalizeNwslTeamKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bfootball club\b/g, " ")
    .replace(/\bfc\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dateOnly(value: unknown): string {
  const text = stringValue(value);
  if (!text) return "";
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function dateDistanceDays(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T12:00:00Z`);
  const rightMs = Date.parse(`${right}T12:00:00Z`);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return Infinity;
  return Math.abs(leftMs - rightMs) / 86_400_000;
}

export function crosswalkOfficialMatchesToEspn(
  officialMatches: NwslPublicRow[],
  teamNamesById: Map<string, string>,
  espnMatches: EspnMatch[] = getEspnMatches2026()
): Map<string, EspnMatch> {
  const result = new Map<string, EspnMatch>();

  for (const match of officialMatches) {
    const officialId = stringValue(match.id);
    const homeName = teamNamesById.get(stringValue(match.home_team_id)) ?? "";
    const awayName = teamNamesById.get(stringValue(match.away_team_id)) ?? "";
    const officialDate =
      dateOnly(match.kickoff_at) || dateOnly(match.local_date);
    const homeKey = normalizeNwslTeamKey(homeName);
    const awayKey = normalizeNwslTeamKey(awayName);

    const candidates = espnMatches
      .filter(
        (candidate) =>
          normalizeNwslTeamKey(candidate.homeTeam) === homeKey &&
          normalizeNwslTeamKey(candidate.awayTeam) === awayKey
      )
      .map((candidate) => ({
        candidate,
        distance: dateDistanceDays(officialDate, candidate.date),
      }))
      .filter(({ distance }) => distance <= 1)
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          left.candidate.matchId.localeCompare(right.candidate.matchId)
      );

    if (officialId && candidates[0]) {
      result.set(officialId, candidates[0].candidate);
    }
  }

  return result;
}

function mapPosition(value: unknown): PlayerPosition {
  const normalized = stringValue(value).toUpperCase();
  if (normalized === "GK" || normalized.includes("GOAL")) return "GK";
  if (normalized === "DEF" || normalized.includes("DEF")) return "DEF";
  if (normalized === "MID" || normalized.includes("MID")) return "MID";
  return "FWD";
}

function mapMatchStatus(value: unknown): MatchResult["status"] {
  const status = stringValue(value).toUpperCase();
  if (status === "FINISHED") return "completed";
  if (status === "LIVE") return "live";
  if (status === "POSTPONED") return "postponed";
  if (status === "CANCELED") return "canceled";
  return "upcoming";
}

function buildMatchdayByDate(matches: MatchResult[]): Map<string, number> {
  const dates = [...new Set(matches.map((match) => match.date).filter(Boolean))].sort();
  return new Map(dates.map((date, index) => [date, index + 1]));
}

function deriveForm(
  officialTeamId: string,
  matches: Array<MatchResult & { homeOfficialId: string; awayOfficialId: string }>
): FormResult[] {
  return matches
    .filter(
      (match) =>
        match.status === "completed" &&
        (match.homeOfficialId === officialTeamId ||
          match.awayOfficialId === officialTeamId)
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 5)
    .map((match) => {
      const isHome = match.homeOfficialId === officialTeamId;
      const goalsFor = isHome ? match.homeGoals : match.awayGoals;
      const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
      if (goalsFor > goalsAgainst) return "W";
      if (goalsFor < goalsAgainst) return "L";
      return "D";
    });
}

function rawNumber(raw: NwslPublicRow, keys: string[]): number {
  for (const key of keys) {
    if (raw[key] !== null && raw[key] !== undefined) {
      return numberValue(raw[key]);
    }
  }
  return 0;
}

function deriveTeamRatings(standings: TeamStanding[]): TeamRating[] {
  return standings
    .map((standing, index) => {
      const played = Math.max(standing.played, 1);
      const goalsForPerGame = standing.goalsFor / played;
      const goalsAgainstPerGame = standing.goalsAgainst / played;
      const attackRating = Math.min(95, Math.max(30, goalsForPerGame * 35 + 20));
      const defenseRating = Math.min(
        95,
        Math.max(30, 90 - goalsAgainstPerGame * 30)
      );
      const recentWins = standing.form.slice(0, 3).filter((form) => form === "W").length;
      const recentLosses = standing.form
        .slice(0, 3)
        .filter((form) => form === "L").length;

      return {
        teamId: standing.teamId,
        team: standing.team,
        overallRating: round((attackRating + defenseRating) / 2),
        attackRating: round(attackRating),
        defenseRating: round(defenseRating),
        homeAdvantage: 0.25,
        trend:
          recentWins >= 2 ? "up" : recentLosses >= 2 ? "down" : "stable",
        previousRank: index + 1,
        currentRank: index + 1,
      } satisfies TeamRating;
    })
    .sort((left, right) => right.overallRating - left.overallRating)
    .map((rating, index) => ({ ...rating, currentRank: index + 1 }));
}

export function mapNwslPublicRows(rows: NwslPublicRows): LiveNwslPublicData {
  const generatedAt = stringValue(rows.run.generated_at);
  const teams: LiveNwslTeam[] = rows.teams.map((team) => ({
    officialId: stringValue(team.id),
    teamId: stringValue(team.slug),
    name:
      stringValue(team.media_name) ||
      stringValue(team.name) ||
      stringValue(team.slug),
    abbreviation: stringValue(team.abbreviation),
  }));
  const teamByOfficialId = new Map(
    teams.map((team) => [team.officialId, team] as const)
  );
  const teamNamesById = new Map(
    teams.map((team) => [team.officialId, team.name] as const)
  );
  const espnByOfficialMatch = crosswalkOfficialMatchesToEspn(
    rows.matches,
    teamNamesById
  );

  const matchesWithOfficialIds = rows.matches.map((match) => {
    const officialMatchId = stringValue(match.id);
    const homeOfficialId = stringValue(match.home_team_id);
    const awayOfficialId = stringValue(match.away_team_id);
    const home = teamByOfficialId.get(homeOfficialId);
    const away = teamByOfficialId.get(awayOfficialId);
    const espn = espnByOfficialMatch.get(officialMatchId);

    return {
      matchId: espn?.matchId ?? officialMatchId.split("::").pop() ?? officialMatchId,
      officialMatchId,
      date:
        espn?.date ||
        dateOnly(match.kickoff_at) ||
        dateOnly(match.local_date),
      matchday: numberValue(match.match_week, 0),
      homeTeam: home?.name ?? "Unknown team",
      homeTeamId: home?.teamId ?? "",
      awayTeam: away?.name ?? "Unknown team",
      awayTeamId: away?.teamId ?? "",
      homeGoals: numberValue(match.home_score),
      awayGoals: numberValue(match.away_score),
      homeXg: 0,
      awayXg: 0,
      venue: stringValue(match.venue),
      status: mapMatchStatus(match.status),
      homeOfficialId,
      awayOfficialId,
    } satisfies MatchResult & {
      homeOfficialId: string;
      awayOfficialId: string;
    };
  });
  const inferredMatchdays = buildMatchdayByDate(matchesWithOfficialIds);
  const matches: MatchResult[] = matchesWithOfficialIds.map((match) => ({
    ...match,
    matchday: match.matchday || inferredMatchdays.get(match.date) || 1,
  }));
  const matchByOfficialId = new Map(
    matches.map((match) => [match.officialMatchId ?? "", match] as const)
  );

  const standings: TeamStanding[] = rows.teamSeasonStats
    .map((stat) => {
      const officialTeamId = stringValue(stat.team_id);
      const team = teamByOfficialId.get(officialTeamId);
      const goalsFor = numberValue(stat.goals_for);
      const goalsAgainst = numberValue(stat.goals_against);

      return {
        teamId: team?.teamId ?? "",
        team: team?.name ?? "Unknown team",
        played: numberValue(stat.games_played),
        won: numberValue(stat.wins),
        drawn: numberValue(stat.draws),
        lost: numberValue(stat.losses),
        goalsFor,
        goalsAgainst,
        goalDifference: numberValue(
          stat.goal_difference,
          goalsFor - goalsAgainst
        ),
        points: numberValue(stat.points),
        form: deriveForm(officialTeamId, matchesWithOfficialIds),
        xg: numberValue(stat.xg),
        xga: numberValue(stat.xga),
      } satisfies TeamStanding;
    })
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.goalDifference - left.goalDifference ||
        right.goalsFor - left.goalsFor
    );

  const teamStats: TeamStats[] = rows.teamSeasonStats.map((stat) => {
    const team = teamByOfficialId.get(stringValue(stat.team_id));
    return {
      teamId: team?.teamId ?? "",
      team: team?.name ?? "Unknown team",
      xg: numberValue(stat.xg),
      xga: numberValue(stat.xga),
      npxg: numberValue(stat.xg),
      possession: numberValue(stat.possession_pct),
      shots: numberValue(stat.shots),
      shotsOnTarget: numberValue(stat.shots_on_target),
      passAccuracy: numberValue(stat.pass_accuracy_pct),
      tackles: numberValue(stat.tackles_won, numberValue(stat.tackles)),
      interceptions: numberValue(stat.interceptions),
      cleanSheets: numberValue(stat.clean_sheets),
      corners: numberValue(stat.corners),
      passes: numberValue(stat.passes_attempted),
      successfulPasses: numberValue(stat.passes_completed),
      yellowCards: numberValue(stat.yellow_cards),
      redCards: numberValue(stat.red_cards),
    };
  });

  const playerStatsById = new Map(
    rows.playerSeasonStats.map((stat) => [stringValue(stat.player_id), stat] as const)
  );
  const players: PlayerSeasonStats[] = rows.players
    .map((player) => {
      const playerId = stringValue(player.id);
      const stat = playerStatsById.get(playerId) ?? {};
      const officialTeamId =
        stringValue(player.current_team_id) || stringValue(stat.team_id);
      const team = teamByOfficialId.get(officialTeamId);
      const minutes = numberValue(stat.minutes_played);
      const fantasyPoints = numberValue(stat.fantasy_points);

      return {
        playerId,
        name: stringValue(player.display_name, "Unknown player"),
        team: team?.name ?? "Unattached",
        teamId: team?.teamId ?? "",
        position: mapPosition(player.position),
        appearances: numberValue(stat.games_played),
        starts: numberValue(stat.starts),
        minutes,
        goals: numberValue(stat.goals),
        assists: numberValue(stat.assists),
        xg: numberValue(stat.xg),
        xa: numberValue(stat.xa),
        shots: numberValue(stat.shots),
        shotsOnTarget: numberValue(stat.shots_on_target),
        passAccuracy: numberValue(stat.pass_accuracy_pct),
        tackles: numberValue(stat.tackles_won, numberValue(stat.tackles)),
        interceptions: numberValue(stat.interceptions),
        cleanSheets: numberValue(stat.clean_sheets),
        saves: numberValue(stat.saves),
        yellowCards: numberValue(stat.yellow_cards),
        redCards: numberValue(stat.red_cards),
        fantasyPoints: round(fantasyPoints),
        pointsPer90: numberValue(
          stat.points_per_90,
          minutes > 0 ? round((fantasyPoints * 90) / minutes) : 0
        ),
        matchStatsAppearances:
          stat.match_stats_appearances === null ||
          stat.match_stats_appearances === undefined
            ? undefined
            : numberValue(stat.match_stats_appearances),
        matchStatsComplete:
          stat.match_stats_complete === null ||
          stat.match_stats_complete === undefined
            ? undefined
            : booleanValue(stat.match_stats_complete),
        chancesCreated: numberValue(stat.chances_created),
        passes: numberValue(stat.passes_attempted),
        successfulPasses: numberValue(stat.passes_completed),
        blocks: numberValue(stat.clearances),
        goalsConceded: numberValue(stat.goals_conceded),
        officialPlayerId: stringValue(player.official_id),
      } satisfies PlayerSeasonStats;
    })
    .sort(
      (left, right) =>
        right.fantasyPoints - left.fantasyPoints ||
        right.minutes - left.minutes ||
        left.name.localeCompare(right.name)
    );

  const playerMatchLogs: Record<string, PlayerMatchLog[]> = {};
  for (const stat of rows.playerMatchStats) {
    const playerId = stringValue(stat.player_id);
    const match = matchByOfficialId.get(stringValue(stat.match_id));
    const team = teamByOfficialId.get(stringValue(stat.team_id));
    const opponent = teamByOfficialId.get(stringValue(stat.opponent_team_id));
    const raw = recordValue(stat.raw_stats);

    if (!match || !team || !opponent) continue;
    const log: PlayerMatchLog = {
      matchId: match.matchId,
      officialMatchId: match.officialMatchId,
      date: match.date,
      opponent: opponent.name,
      opponentId: opponent.teamId,
      teamId: team.teamId,
      home: booleanValue(stat.is_home),
      minutes: numberValue(stat.minutes),
      goals: numberValue(stat.goals),
      assists: numberValue(stat.assists),
      shots: numberValue(stat.shots),
      shotsOnTarget: numberValue(stat.shots_on_target),
      passes: numberValue(stat.passes_attempted),
      successfulPasses: numberValue(stat.passes_completed),
      passAccuracy: numberValue(stat.pass_accuracy_pct),
      tackles: numberValue(stat.tackles_won, numberValue(stat.tackles)),
      interceptions: numberValue(stat.interceptions),
      saves: numberValue(stat.saves),
      chancesCreated: numberValue(stat.chances_created),
      crosses: rawNumber(raw, [
        "successful_crosses",
        "successful_crosses_open_play",
        "successful_crosses_corners",
      ]),
      foulsWon: rawNumber(raw, ["fouls_won", "total_fouls_won"]),
      foulsCommitted: rawNumber(raw, [
        "fouls_committed",
        "total_fouls_conceded",
      ]),
      blocks: rawNumber(raw, ["blocks", "blocked_shots"]),
      cleanSheet: booleanValue(raw.clean_sheet ?? raw.clean_sheets),
      goalsConceded: numberValue(stat.goals_conceded),
      yellowCards: numberValue(stat.yellow_cards),
      redCards: numberValue(stat.red_cards),
      penaltySaves: rawNumber(raw, ["penalty_saves", "penalties_saved"]),
      penaltyMisses: rawNumber(raw, ["penalty_misses"]),
      goalkeeperWin: booleanValue(raw.goalkeeper_win),
      goalkeeperDraw: booleanValue(raw.goalkeeper_draw),
      fantasyPoints: round(numberValue(stat.fantasy_points)),
      fantasyBreakdown: Object.fromEntries(
        Object.entries(recordValue(stat.fantasy_breakdown)).map(([key, value]) => [
          key,
          numberValue(value),
        ])
      ),
    };

    (playerMatchLogs[playerId] ??= []).push(log);
  }

  const playerForms: Record<string, PlayerFormPoint[]> = {};
  for (const [playerId, logs] of Object.entries(playerMatchLogs)) {
    logs.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.matchId.localeCompare(right.matchId)
    );
    playerForms[playerId] = logs.map((log, index) => ({
      matchday: index + 1,
      date: log.date,
      fantasyPoints: log.fantasyPoints,
      opponent: log.opponent,
    }));
  }

  const generatedMs = Date.parse(generatedAt);
  return {
    provenance: {
      season: "2026",
      source: "Official NWSL / Opta",
      sourceUrl: stringValue(rows.run.source_url),
      generatedAt,
      publishedAt: stringValue(rows.run.published_at),
      checksum: stringValue(rows.run.payload_checksum),
      isLive: true,
      isStale:
        !Number.isFinite(generatedMs) || Date.now() - generatedMs > 36 * 60 * 60 * 1000,
    },
    teams,
    standings,
    teamStats,
    teamRatings: deriveTeamRatings(standings),
    players,
    matches,
    playerMatchLogs,
    playerForms,
  };
}

export function validateNwslPublicRows(rows: NwslPublicRows): string[] {
  const issues: string[] = [];
  const expected = (key: string) => numberValue(rows.run[key], -1);
  const checks: Array<[string, number, number]> = [
    ["teams", rows.teams.length, expected("teams_count")],
    ["players", rows.players.length, expected("players_count")],
    ["matches", rows.matches.length, expected("matches_count")],
    [
      "player season stats",
      rows.playerSeasonStats.length,
      expected("player_season_stats_count"),
    ],
    [
      "team season stats",
      rows.teamSeasonStats.length,
      expected("team_season_stats_count"),
    ],
    [
      "player match stats",
      rows.playerMatchStats.length,
      expected("player_match_stats_count"),
    ],
  ];

  for (const [label, actual, runCount] of checks) {
    if (runCount >= 0 && actual !== runCount) {
      issues.push(`${label} count ${actual} does not match run count ${runCount}`);
    }
  }
  if (rows.teams.length !== 16) issues.push("expected exactly 16 teams");
  if (rows.players.length < 440) issues.push("expected at least 440 players");
  if (rows.matches.length < 240) issues.push("expected at least 240 matches");
  if (rows.playerSeasonStats.length < 430) {
    issues.push("expected at least 430 player season rows");
  }
  if (rows.teamSeasonStats.length !== 16) {
    issues.push("expected exactly 16 team season rows");
  }

  const runId = stringValue(rows.run.id);
  if (
    !runId ||
    [...rows.teams, ...rows.players, ...rows.matches].some(
      (row) => stringValue(row.data_run_id) !== runId
    )
  ) {
    issues.push("entity rows do not all belong to the selected run");
  }

  return issues;
}
