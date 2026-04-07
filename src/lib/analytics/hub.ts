import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import Papa from "papaparse";
import { getFbrefAnalyticsHubData, type AnalyticsHubData as FbrefAnalyticsHubData } from "@/lib/analytics/fbref";

const OFFICIAL_DIR = path.join(process.cwd(), "data", "nwsl-official");
const STATSBOMB_DIR = path.join(process.cwd(), "data", "statsbomb");
const NWSLR_DIR = path.join(process.cwd(), "data", "nwslr");

type CsvValue = string | number | boolean | null;
type CsvRow = Record<string, CsvValue>;

export interface OfficialSeasonArchiveRecord {
  season: number;
  teams: number;
  matches: number;
  completedMatches: number;
  topTeam: string;
  topTeamPoints: number;
  topScorer: string;
  topScorerGoals: number;
}

export interface OfficialStandingRecord {
  team: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  goalsAgainst: number;
  goalDifference: number;
  possession: number;
  passAccuracy: number;
}

export interface OfficialPlayerLeaderRecord {
  playerId: string;
  player: string;
  team: string;
  role: string;
  gamesPlayed: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  xg: number;
  totalPasses: number;
  accuratePassPercentage: number;
  tacklesWon: number;
  shots: number;
}

export interface OfficialPlayerMatchLogRecord {
  matchDateUtc: string;
  opponentTeamName: string;
  venue: string;
  result: string;
  goalsFor: number;
  goalsAgainst: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  xg: number;
  totalPasses: number;
  tacklesWon: number;
}

export interface OfficialPlayerLogSummary {
  playerId: string;
  player: string;
  team: string;
  role: string;
  gamesPlayed: number;
  minutesPlayed: number;
  xg: number;
  recentMatches: OfficialPlayerMatchLogRecord[];
}

export interface OfficialFixtureRecord {
  matchId: string;
  matchDateUtc: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  stadium: string;
  city: string;
  round: string;
}

export interface StatsBombSummaryRecord {
  label: string;
  team: string;
  value: number;
  secondaryValue: number;
  tertiaryValue: number;
}

export interface StatsBombMatchSummaryRecord {
  matchId: number;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  homeXg: number;
  awayXg: number;
  totalXg: number;
  homeGoals: number;
  awayGoals: number;
}

export interface NwslrSummaryRecord {
  label: string;
  team: string;
  value: number;
  secondaryValue: number;
}

export interface MultiSourceAnalyticsHubData extends FbrefAnalyticsHubData {
  official: {
    selectedSeason: number | null;
    latestSeason: number | null;
    archive: OfficialSeasonArchiveRecord[];
    standings: OfficialStandingRecord[];
    playerLeaders: OfficialPlayerLeaderRecord[];
    recentFixtures: OfficialFixtureRecord[];
    upcomingFixtures: OfficialFixtureRecord[];
    currentPlayerLogs: OfficialPlayerLogSummary[];
  };
  statsbomb: {
    playerXgLeaders: StatsBombSummaryRecord[];
    teamXgLeaders: StatsBombSummaryRecord[];
    matchXgLeaders: StatsBombMatchSummaryRecord[];
  };
  nwslr: {
    franchiseCount: number;
    stadiumCount: number;
    awardCount: number;
    careerScorers: NwslrSummaryRecord[];
    careerPlaymakers: NwslrSummaryRecord[];
    careerKeepers: NwslrSummaryRecord[];
    archiveBallWinners: NwslrSummaryRecord[];
  };
}

function parseCsvRows(csv: string) {
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  return parsed.data.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? null]))
  );
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readCsvIfExists(dir: string, fileName: string) {
  const filePath = path.join(dir, fileName);
  if (!(await pathExists(filePath))) {
    return [] as CsvRow[];
  }

  const csv = await fs.readFile(filePath, "utf8");
  return parseCsvRows(csv);
}

function toNumber(value: CsvValue | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (!value) {
    return 0;
  }

  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized || normalized.toLowerCase() === "nan") {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: CsvValue | undefined) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sortByDateDesc<T extends { matchDateUtc?: string; matchDate?: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftDate = new Date(left.matchDateUtc ?? left.matchDate ?? "").getTime();
    const rightDate = new Date(right.matchDateUtc ?? right.matchDate ?? "").getTime();
    return rightDate - leftDate;
  });
}

async function loadOfficialData(requestedSeason?: number) {
  const seasons = await readCsvIfExists(OFFICIAL_DIR, "nwsl_official_seasons.csv");
  const availableSeasons = seasons
    .map((row) => toNumber(row.season))
    .filter((value) => value > 0)
    .sort((left, right) => right - left);

  const latestSeason = availableSeasons[0] ?? null;
  const selectedSeason =
    requestedSeason && availableSeasons.includes(requestedSeason)
      ? requestedSeason
      : latestSeason;

  if (!selectedSeason) {
    return {
      selectedSeason: null,
      latestSeason: null,
      archive: [],
      standings: [],
      playerLeaders: [],
      recentFixtures: [],
      upcomingFixtures: [],
      currentPlayerLogs: [],
    };
  }

  const [selectedTeamStats, selectedPlayerStats, selectedMatches, latestLogs] = await Promise.all([
    readCsvIfExists(OFFICIAL_DIR, `nwsl_${selectedSeason}_official_team_stats.csv`),
    readCsvIfExists(OFFICIAL_DIR, `nwsl_${selectedSeason}_official_player_stats.csv`),
    readCsvIfExists(OFFICIAL_DIR, `nwsl_${selectedSeason}_official_matches.csv`),
    latestSeason
      ? readCsvIfExists(OFFICIAL_DIR, `nwsl_${latestSeason}_official_player_match_logs.csv`)
      : Promise.resolve([] as CsvRow[]),
  ]);

  const archive = await Promise.all(
    availableSeasons.map(async (season) => {
      const [teamRows, playerRows, matchRows] = await Promise.all([
        readCsvIfExists(OFFICIAL_DIR, `nwsl_${season}_official_team_stats.csv`),
        readCsvIfExists(OFFICIAL_DIR, `nwsl_${season}_official_player_stats.csv`),
        readCsvIfExists(OFFICIAL_DIR, `nwsl_${season}_official_matches.csv`),
      ]);

      const topTeam = [...teamRows].sort((left, right) => {
        const pointDiff = toNumber(right.total_points) - toNumber(left.total_points);
        if (pointDiff !== 0) return pointDiff;
        return (toNumber(right.goals) - toNumber(right.goals_against))
          - (toNumber(left.goals) - toNumber(left.goals_against));
      })[0];

      const topScorer = [...playerRows].sort(
        (left, right) => toNumber(right.goals) - toNumber(left.goals)
      )[0];

      return {
        season,
        teams: teamRows.length,
        matches: matchRows.length,
        completedMatches: matchRows.filter((row) => toText(row.status) === "FINISHED").length,
        topTeam: toText(topTeam?.official_name),
        topTeamPoints: toNumber(topTeam?.total_points),
        topScorer: [toText(topScorer?.media_first_name), toText(topScorer?.media_last_name)].filter(Boolean).join(" "),
        topScorerGoals: toNumber(topScorer?.goals),
      } satisfies OfficialSeasonArchiveRecord;
    })
  );

  const standings = [...selectedTeamStats]
    .map((row) => ({
      team: toText(row.official_name),
      points: toNumber(row.total_points),
      wins: toNumber(row.total_wins),
      draws: toNumber(row.total_draws),
      losses: toNumber(row.total_losses),
      goals: toNumber(row.goals),
      goalsAgainst: toNumber(row.goals_against),
      goalDifference: toNumber(row.goals) - toNumber(row.goals_against),
      possession: toNumber(row.average_possession || row.possession_percentage),
      passAccuracy: toNumber(row.passes_accuracy || row.accurate_pass_percentage),
    }))
    .sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      if (right.goalDifference !== left.goalDifference) return right.goalDifference - left.goalDifference;
      return right.goals - left.goals;
    });

  const playerLeaders = [...selectedPlayerStats]
    .map((row) => ({
      playerId: toText(row.player_id),
      player: [toText(row.media_first_name), toText(row.media_last_name)].filter(Boolean).join(" "),
      team: toText(row.team_official_name),
      role: toText(row.role_label),
      gamesPlayed: toNumber(row.games_played),
      minutesPlayed: toNumber(row.minutes_played || row.time_played),
      goals: toNumber(row.goals),
      assists: toNumber(row.assists || row.goal_assists),
      xg: toNumber(row.xg),
      totalPasses: toNumber(row.total_passes || row.total_pass),
      accuratePassPercentage: toNumber(row.accurate_pass_percentage || row.passes_accuracy),
      tacklesWon: toNumber(row.tackles_won),
      shots: toNumber(row.total_shots || row.total_scoring_attempts),
    }))
    .filter((row) => row.player)
    .sort((left, right) => {
      if (right.goals !== left.goals) return right.goals - left.goals;
      if (right.xg !== left.xg) return right.xg - left.xg;
      return right.minutesPlayed - left.minutesPlayed;
    })
    .slice(0, 18);

  const officialFixtures = [...selectedMatches]
    .map((row) => ({
      matchId: toText(row.match_id),
      matchDateUtc: toText(row.match_date_utc),
      status: toText(row.status),
      homeTeam: toText(row.home_official_name),
      awayTeam: toText(row.away_official_name),
      homeScore: toNumber(row.home_score),
      awayScore: toNumber(row.away_score),
      stadium: toText(row.stadium_name),
      city: toText(row.city_name),
      round: toText(row.round_name || row.match_week),
    }))
    .filter((row) => row.matchId && row.homeTeam && row.awayTeam)
    .sort((left, right) => {
      const leftDate = new Date(left.matchDateUtc).getTime();
      const rightDate = new Date(right.matchDateUtc).getTime();
      return leftDate - rightDate;
    });

  const recentFixtures = officialFixtures
    .filter((row) => row.status === "FINISHED")
    .slice(-6)
    .reverse();
  const upcomingFixtures = officialFixtures
    .filter((row) => row.status !== "FINISHED")
    .slice(0, 6);

  const latestSeasonPlayerStats = latestSeason
    ? await readCsvIfExists(OFFICIAL_DIR, `nwsl_${latestSeason}_official_player_stats.csv`)
    : [];
  const latestPlayersById = new Map(
    latestSeasonPlayerStats.map((row) => [toText(row.player_id), row] as const)
  );
  const logsByPlayer = new Map<string, OfficialPlayerMatchLogRecord[]>();

  for (const row of latestLogs) {
    const playerId = toText(row.player_id);
    if (!playerId) continue;

    const entries = logsByPlayer.get(playerId) ?? [];
    entries.push({
      matchDateUtc: toText(row.match_date_utc),
      opponentTeamName: toText(row.opponent_team_name),
      venue: toText(row.venue),
      result: toText(row.result),
      goalsFor: toNumber(row.goals_for),
      goalsAgainst: toNumber(row.goals_against),
      minutesPlayed: toNumber(row.minutes_played || row.time_played),
      goals: toNumber(row.goals),
      assists: toNumber(row.assists || row.goal_assists),
      xg: toNumber(row.xg),
      totalPasses: toNumber(row.total_passes || row.total_pass),
      tacklesWon: toNumber(row.tackles_won),
    });
    logsByPlayer.set(playerId, entries);
  }

  const currentPlayerLogs = [...logsByPlayer.entries()]
    .map(([playerId, rows]) => {
      const seasonRow = latestPlayersById.get(playerId);
      return {
        playerId,
        player: [toText(seasonRow?.media_first_name), toText(seasonRow?.media_last_name)].filter(Boolean).join(" "),
        team: toText(seasonRow?.team_official_name),
        role: toText(seasonRow?.role_label),
        gamesPlayed: toNumber(seasonRow?.games_played),
        minutesPlayed: toNumber(seasonRow?.minutes_played || seasonRow?.time_played),
        xg: toNumber(seasonRow?.xg),
        recentMatches: sortByDateDesc(rows).slice(0, 5),
      } satisfies OfficialPlayerLogSummary;
    })
    .filter((row) => row.player)
    .sort((left, right) => right.minutesPlayed - left.minutesPlayed)
    .slice(0, 12);

  return {
    selectedSeason,
    latestSeason,
    archive,
    standings,
    playerLeaders,
    recentFixtures,
    upcomingFixtures,
    currentPlayerLogs,
  };
}

async function loadStatsBombData() {
  const [playerRows, teamRows, matchRows] = await Promise.all([
    readCsvIfExists(STATSBOMB_DIR, "nwsl_2018_player_xg_summary.csv"),
    readCsvIfExists(STATSBOMB_DIR, "nwsl_2018_team_xg_summary.csv"),
    readCsvIfExists(STATSBOMB_DIR, "nwsl_2018_match_team_xg.csv"),
  ]);

  const playerXgLeaders = playerRows.slice(0, 8).map((row) => ({
    label: toText(row.player),
    team: toText(row.team),
    value: round(toNumber(row.total_xg)),
    secondaryValue: toNumber(row.goals),
    tertiaryValue: toNumber(row.shots),
  }));

  const teamXgLeaders = teamRows.slice(0, 8).map((row) => ({
    label: toText(row.team),
    team: toText(row.team),
    value: round(toNumber(row.total_xg)),
    secondaryValue: toNumber(row.goals),
    tertiaryValue: toNumber(row.shots),
  }));

  const byMatch = new Map<string, StatsBombMatchSummaryRecord>();
  for (const row of matchRows) {
    const matchId = toNumber(row.match_id);
    const homeTeam = toText(row.home_team);
    const awayTeam = toText(row.away_team);
    const key = `${matchId}`;
    const current = byMatch.get(key) ?? {
      matchId,
      matchDate: toText(row.match_date),
      homeTeam,
      awayTeam,
      homeXg: 0,
      awayXg: 0,
      totalXg: 0,
      homeGoals: 0,
      awayGoals: 0,
    };

    const teamName = toText(row.team);
    if (teamName === homeTeam) {
      current.homeXg = round(toNumber(row.total_xg));
      current.homeGoals = toNumber(row.goals);
    } else if (teamName === awayTeam) {
      current.awayXg = round(toNumber(row.total_xg));
      current.awayGoals = toNumber(row.goals);
    }
    current.totalXg = round(current.homeXg + current.awayXg);
    byMatch.set(key, current);
  }

  const matchXgLeaders = [...byMatch.values()]
    .sort((left, right) => right.totalXg - left.totalXg)
    .slice(0, 8);

  return {
    playerXgLeaders,
    teamXgLeaders,
    matchXgLeaders,
  };
}

async function loadNwslrData() {
  const [fieldplayerRows, goalkeeperRows, advPlayerRows, franchiseRows, stadiumRows, awardRows] =
    await Promise.all([
      readCsvIfExists(NWSLR_DIR, "nwslr_fieldplayer_season_stats_2013_2019.csv"),
      readCsvIfExists(NWSLR_DIR, "nwslr_goalkeeper_season_stats_2013_2019.csv"),
      readCsvIfExists(NWSLR_DIR, "nwslr_adv_player_stats_2016_2019.csv"),
      readCsvIfExists(NWSLR_DIR, "nwslr_franchise_history.csv"),
      readCsvIfExists(NWSLR_DIR, "nwslr_stadiums.csv"),
      readCsvIfExists(NWSLR_DIR, "nwslr_awards.csv"),
    ]);

  const summarizeFieldplayers = (metricKey: string, limit = 8) =>
    [...fieldplayerRows.reduce((map, row) => {
      const label = toText(row.Player);
      if (!label) return map;
      const current = map.get(label) ?? {
        label,
        team: toText(row.Squad),
        value: 0,
        secondaryValue: 0,
      };
      current.value += toNumber(row[metricKey]);
      current.secondaryValue += toNumber(row.MP);
      map.set(label, current);
      return map;
    }, new Map<string, NwslrSummaryRecord>()).values()]
      .sort((left, right) => right.value - left.value)
      .slice(0, limit);

  const summarizeGoalkeepers = (metricKey: string, limit = 8) =>
    [...goalkeeperRows.reduce((map, row) => {
      const label = toText(row.Player);
      if (!label) return map;
      const current = map.get(label) ?? {
        label,
        team: toText(row.Squad),
        value: 0,
        secondaryValue: 0,
      };
      current.value += toNumber(row[metricKey]);
      current.secondaryValue += toNumber(row.Saves);
      map.set(label, current);
      return map;
    }, new Map<string, NwslrSummaryRecord>()).values()]
      .sort((left, right) => right.value - left.value)
      .slice(0, limit);

  const archiveBallWinners = [...advPlayerRows.reduce((map, row) => {
    const label = toText(row.full_name);
    if (!label) return map;

    const current = map.get(label) ?? {
      label,
      team: toText(row.team_id),
      value: 0,
      secondaryValue: 0,
    };

    current.value += toNumber(row.ball_recovery) + toNumber(row.interception) + toNumber(row.total_tackle);
    current.secondaryValue += toNumber(row.mins_played);
    map.set(label, current);
    return map;
  }, new Map<string, NwslrSummaryRecord>()).values()]
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);

  return {
    franchiseCount: franchiseRows.length,
    stadiumCount: stadiumRows.length,
    awardCount: awardRows.length,
    careerScorers: summarizeFieldplayers("Gls"),
    careerPlaymakers: summarizeFieldplayers("Ast"),
    careerKeepers: summarizeGoalkeepers("CS"),
    archiveBallWinners,
  };
}

export const getAnalyticsHubData = cache(async (requestedSeason?: number) => {
  const [fbrefData, officialData, statsbombData, nwslrData] = await Promise.all([
    getFbrefAnalyticsHubData(requestedSeason),
    loadOfficialData(requestedSeason),
    loadStatsBombData(),
    loadNwslrData(),
  ]);

  const extraSources = ["Official NWSL API", "nwslR archive", "StatsBomb Open Data"];

  return {
    ...fbrefData,
    dataSources: [...new Set([...fbrefData.dataSources, ...extraSources])],
    official: officialData,
    statsbomb: statsbombData,
    nwslr: nwslrData,
  } satisfies MultiSourceAnalyticsHubData;
});
