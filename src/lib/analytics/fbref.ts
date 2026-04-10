import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import Papa from "papaparse";

const FBREF_DIR = path.join(process.cwd(), "data", "fbref");

const PLAYER_FILE_KEYS = [
  "standard",
  "shooting",
  "passing",
  "passing_types",
  "goal_shot_creation",
  "defense",
  "possession",
  "misc",
  "keeper",
  "keeper_adv",
  "playing_time",
] as const;

const TEAM_FILE_KEYS = [
  "standard",
  "shooting",
  "passing",
  "passing_types",
  "goal_shot_creation",
  "defense",
  "possession",
  "misc",
  "keeper",
  "keeper_adv",
  "playing_time",
] as const;

const FILE_ALIASES: Record<string, string[]> = {
  goal_shot_creation: ["goal_shot_creation", "gca"],
};

type CsvValue = string | number | boolean | null;
type CsvRow = Record<string, CsvValue>;

type PositionGroup = "Forward" | "Midfielder" | "Defender" | "Goalkeeper" | "Utility";

export interface PlayerAnalyticsRecord {
  key: string;
  player: string;
  team: string;
  position: string;
  positionGroup: PositionGroup;
  age: number | null;
  matches: number;
  starts: number;
  minutes90: number;
  goals: number;
  assists: number;
  goalsPer90: number;
  assistsPer90: number;
  shots: number;
  shotsOnTarget: number;
  shotsPer90: number;
  shotsOnTargetPer90: number;
  goalsPerShot: number;
  passesCompleted: number;
  passesPct: number;
  passesProgressiveDistance: number;
  passesIntoFinalThird: number;
  passesIntoPenaltyArea: number;
  crossesIntoPenaltyArea: number;
  xgAssistNet: number;
  assistedShots: number;
  sca: number;
  scaPer90: number;
  gca: number;
  gcaPer90: number;
  tacklesWon: number;
  interceptions: number;
  blocks: number;
  clearances: number;
  carriesProgressiveDistance: number;
  carriesIntoFinalThird: number;
  carriesIntoPenaltyArea: number;
  takeOnsWonPct: number;
  plusMinusPer90: number;
  pointsPerGame: number;
  isGoalkeeper: boolean;
  goalkeeperMinutes90: number;
  savePct: number;
  cleanSheetsPct: number;
  goalsAgainstPer90: number;
  finishingIndex: number;
  playmakerIndex: number;
  progressionIndex: number;
  ballWinningIndex: number;
  goalkeeperIndex: number;
  overallIndex: number;
  usageIndex: number;
  profileBlurb: string;
}

export interface TeamGameLogEntry {
  matchKey: string;
  team: string;
  opponent: string;
  date: string;
  venue: "Home" | "Away";
  round: string | null;
  gameweek: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: "W" | "D" | "L" | "TBD";
}

export interface TeamAnalyticsRecord {
  team: string;
  avgAge: number | null;
  possession: number;
  goals: number;
  goalsPer90: number;
  assists: number;
  assistsPer90: number;
  shots: number;
  shotsOnTarget: number;
  shotsPer90: number;
  shotsOnTargetPct: number;
  goalsPerShot: number;
  passesCompleted: number;
  passesPct: number;
  passesProgressiveDistance: number;
  passesIntoFinalThird: number;
  passesIntoPenaltyArea: number;
  xgAssistNet: number;
  sca: number;
  scaPer90: number;
  gca: number;
  gcaPer90: number;
  tacklesWon: number;
  challengesPct: number;
  blocks: number;
  interceptions: number;
  clearances: number;
  errors: number;
  saves: number;
  savePct: number;
  cleanSheetsPct: number;
  goalsAgainstPer90: number;
  offenseIndex: number;
  defenseIndex: number;
  controlIndex: number;
  overallIndex: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  lastFive: string;
  roster: PlayerAnalyticsRecord[];
  gameLog: TeamGameLogEntry[];
}

export interface FixtureAnalyticsRecord {
  matchKey: string;
  date: string;
  dateLabel: string;
  round: string | null;
  gameweek: number | null;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  attendance: number | null;
  venue: string | null;
  referee: string | null;
  resultLabel: string;
  winner: string | null;
  profileEdge: string;
  recapTag: string;
}

export interface AnalyticsHubData {
  season: number;
  availableSeasons: number[];
  dataSources: string[];
  players: PlayerAnalyticsRecord[];
  teams: TeamAnalyticsRecord[];
  goalkeepers: PlayerAnalyticsRecord[];
  fixtures: FixtureAnalyticsRecord[];
  recentRecaps: FixtureAnalyticsRecord[];
  previewFixtures: FixtureAnalyticsRecord[];
  playerUsageBoard: PlayerAnalyticsRecord[];
  glossary: Array<{ term: string; definition: string }>;
}

function normalizeSeason(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function toNumber(value: CsvValue) {
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

function toNullableNumber(value: CsvValue) {
  const parsed = toNumber(value);
  return parsed === 0 && (value === null || value === "" || value === undefined) ? null : parsed;
}

function toText(value: CsvValue) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function parseCsvRows(csv: string) {
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  return parsed.data.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value ?? null])
  ));
}

async function readCsvFile(fileName: string) {
  const filePath = path.join(FBREF_DIR, fileName);
  const csv = await fs.readFile(filePath, "utf8");
  return parseCsvRows(csv);
}

async function readStatFile(kind: "player" | "team", season: number, statType: string) {
  const aliases = FILE_ALIASES[statType] ?? [statType];

  for (const alias of aliases) {
    const fileName = `nwsl_${season}_${kind}_${alias}.csv`;
    const filePath = path.join(FBREF_DIR, fileName);

    if (await pathExists(filePath)) {
      return readCsvFile(fileName);
    }
  }

  return [] as CsvRow[];
}

function makePlayerKey(row: CsvRow) {
  const player = toText(row.player);
  const team = toText(row.team);
  return player && team ? `${player}__${team}` : null;
}

function makePositionGroup(position: string): PositionGroup {
  if (position.includes("GK")) return "Goalkeeper";
  if (position.includes("FW")) return "Forward";
  if (position.includes("MF")) return "Midfielder";
  if (position.includes("DF")) return "Defender";
  return "Utility";
}

function zScore(values: number[], current: number, invert = false) {
  const usable = values.filter((value) => Number.isFinite(value));

  if (usable.length < 2) {
    return 0;
  }

  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const variance =
    usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length;
  const deviation = Math.sqrt(variance);

  if (!deviation) {
    return 0;
  }

  const raw = (current - mean) / deviation;
  return invert ? raw * -1 : raw;
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function scoreRows<T extends object, K extends keyof T>(
  rows: T[],
  metrics: Array<{ key: K; invert?: boolean; weight?: number }>,
  outputKey: K
) {
  const scored = rows.map((row) => ({ ...row })) as T[];

  for (const row of scored) {
    let total = 0;

    for (const metric of metrics) {
      const values = scored.map((entry) => Number(entry[metric.key] ?? 0));
      const current = Number(row[metric.key] ?? 0);
      total += zScore(values, current, metric.invert) * (metric.weight ?? 1);
    }

    (row as unknown as Record<K, number>)[outputKey] = rounded(total);
  }

  return scored;
}

function buildPlayerProfile(player: PlayerAnalyticsRecord) {
  const tags: string[] = [];

  if (player.isGoalkeeper) {
    if (player.savePct >= 75) tags.push("elite shot-stopper");
    if (player.cleanSheetsPct >= 35) tags.push("clean-sheet engine");
  } else {
    if (player.finishingIndex >= 2.2) tags.push("high-end finisher");
    if (player.playmakerIndex >= 2.2) tags.push("chance creator");
    if (player.progressionIndex >= 2) tags.push("progression carrier");
    if (player.ballWinningIndex >= 2) tags.push("ball-winner");
    if (player.minutes90 >= 15 && tags.length === 0) tags.push("heavy-minute starter");
  }

  return tags.slice(0, 2).join(" • ") || "rotation profile";
}

function parseScore(score: string) {
  const match = score.match(/(\d+)\D+(\d+)/);
  return match
    ? {
        homeGoals: Number(match[1]),
        awayGoals: Number(match[2]),
      }
    : { homeGoals: null, awayGoals: null };
}

function formatDateLabel(dateText: string) {
  const parsed = new Date(dateText);

  if (Number.isNaN(parsed.getTime())) {
    return dateText;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function buildFixtureKey(row: CsvRow) {
  return [toText(row.date), toText(row.home_team), toText(row.away_team)].join("__");
}

async function listAvailableSeasons() {
  const entries = await fs.readdir(FBREF_DIR);
  const seasons = entries
    .map((entry) => entry.match(/^nwsl_(\d{4})_player_standard\.csv$/)?.[1] ?? null)
    .map((value) => (value ? normalizeSeason(value) : null))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left);

  return Array.from(new Set(seasons));
}

function sortByDateDesc<T extends { date: string }>(rows: T[]) {
  return [...rows].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
  );
}

export const getFbrefAnalyticsHubData = cache(async (requestedSeason?: number) => {
  const availableSeasons = await listAvailableSeasons();
  const season =
    requestedSeason && availableSeasons.includes(requestedSeason)
      ? requestedSeason
      : availableSeasons[0];

  if (!season) {
    return {
      season: new Date().getFullYear(),
      availableSeasons: [],
      dataSources: [],
      players: [],
      teams: [],
      goalkeepers: [],
      fixtures: [],
      recentRecaps: [],
      previewFixtures: [],
      playerUsageBoard: [],
      glossary: [],
    } satisfies AnalyticsHubData;
  }

  const [playerFiles, teamFiles, scheduleRows] = await Promise.all([
    Promise.all(PLAYER_FILE_KEYS.map(async (key) => [key, await readStatFile("player", season, key)] as const)),
    Promise.all(TEAM_FILE_KEYS.map(async (key) => [key, await readStatFile("team", season, key)] as const)),
    readCsvFile(`nwsl_${season}_schedule.csv`),
  ]);

  const playerSources = new Map<string, CsvRow[]>(playerFiles);
  const teamSources = new Map<string, CsvRow[]>(teamFiles);

  const playerMap = new Map<string, PlayerAnalyticsRecord>();

  for (const row of playerSources.get("standard") ?? []) {
    const key = makePlayerKey(row);
    if (!key) continue;

    const position = toText(row.position);
    playerMap.set(key, {
      key,
      player: toText(row.player),
      team: toText(row.team),
      position,
      positionGroup: makePositionGroup(position),
      age: toNullableNumber(row.age),
      matches: toNumber(row.games),
      starts: toNumber(row.games_starts),
      minutes90: toNumber(row.minutes_90s),
      goals: toNumber(row.goals),
      assists: toNumber(row.assists),
      goalsPer90: toNumber(row.goals_per90),
      assistsPer90: toNumber(row.assists_per90),
      shots: 0,
      shotsOnTarget: 0,
      shotsPer90: 0,
      shotsOnTargetPer90: 0,
      goalsPerShot: 0,
      passesCompleted: 0,
      passesPct: 0,
      passesProgressiveDistance: 0,
      passesIntoFinalThird: 0,
      passesIntoPenaltyArea: 0,
      crossesIntoPenaltyArea: 0,
      xgAssistNet: 0,
      assistedShots: 0,
      sca: 0,
      scaPer90: 0,
      gca: 0,
      gcaPer90: 0,
      tacklesWon: 0,
      interceptions: 0,
      blocks: 0,
      clearances: 0,
      carriesProgressiveDistance: 0,
      carriesIntoFinalThird: 0,
      carriesIntoPenaltyArea: 0,
      takeOnsWonPct: 0,
      plusMinusPer90: 0,
      pointsPerGame: 0,
      isGoalkeeper: position.includes("GK"),
      goalkeeperMinutes90: 0,
      savePct: 0,
      cleanSheetsPct: 0,
      goalsAgainstPer90: 0,
      finishingIndex: 0,
      playmakerIndex: 0,
      progressionIndex: 0,
      ballWinningIndex: 0,
      goalkeeperIndex: 0,
      overallIndex: 0,
      usageIndex: 0,
      profileBlurb: "",
    });
  }

  const mergePlayerMetrics = (rows: CsvRow[], merge: (player: PlayerAnalyticsRecord, row: CsvRow) => void) => {
    for (const row of rows) {
      const key = makePlayerKey(row);
      if (!key) continue;

      const player = playerMap.get(key);
      if (!player) continue;
      merge(player, row);
    }
  };

  mergePlayerMetrics(playerSources.get("shooting") ?? [], (player, row) => {
    player.shots = toNumber(row.shots);
    player.shotsOnTarget = toNumber(row.shots_on_target);
    player.shotsPer90 = toNumber(row.shots_per90);
    player.shotsOnTargetPer90 = toNumber(row.shots_on_target_per90);
    player.goalsPerShot = toNumber(row.goals_per_shot);
  });

  mergePlayerMetrics(playerSources.get("passing") ?? [], (player, row) => {
    player.passesCompleted = toNumber(row.passes_completed);
    player.passesPct = toNumber(row.passes_pct);
    player.passesProgressiveDistance = toNumber(row.passes_progressive_distance);
    player.passesIntoFinalThird = toNumber(row.passes_into_final_third);
    player.passesIntoPenaltyArea = toNumber(row.passes_into_penalty_area);
    player.crossesIntoPenaltyArea = toNumber(row.crosses_into_penalty_area);
    player.xgAssistNet = toNumber(row.xg_assist_net);
    player.assistedShots = toNumber(row.assisted_shots);
  });

  mergePlayerMetrics(playerSources.get("goal_shot_creation") ?? [], (player, row) => {
    player.sca = toNumber(row.sca);
    player.scaPer90 = toNumber(row.sca_per90);
    player.gca = toNumber(row.gca);
    player.gcaPer90 = toNumber(row.gca_per90);
  });

  mergePlayerMetrics(playerSources.get("defense") ?? [], (player, row) => {
    player.tacklesWon = toNumber(row.tackles_won);
    player.interceptions = toNumber(row.interceptions);
    player.blocks = toNumber(row.blocks);
    player.clearances = toNumber(row.clearances);
  });

  mergePlayerMetrics(playerSources.get("possession") ?? [], (player, row) => {
    player.carriesProgressiveDistance = toNumber(row.carries_progressive_distance);
    player.carriesIntoFinalThird = toNumber(row.carries_into_final_third);
    player.carriesIntoPenaltyArea = toNumber(row.carries_into_penalty_area);
    player.takeOnsWonPct = toNumber(row.take_ons_won_pct);
  });

  mergePlayerMetrics(playerSources.get("playing_time") ?? [], (player, row) => {
    player.plusMinusPer90 = toNumber(row.plus_minus_per90);
    player.pointsPerGame = toNumber(row.points_per_game);
  });

  mergePlayerMetrics(playerSources.get("keeper") ?? [], (player, row) => {
    player.isGoalkeeper = true;
    player.positionGroup = "Goalkeeper";
    player.goalkeeperMinutes90 = toNumber(row.minutes_90s);
    player.savePct = toNumber(row.gk_save_pct);
    player.cleanSheetsPct = toNumber(row.gk_clean_sheets_pct);
    player.goalsAgainstPer90 = toNumber(row.gk_goals_against_per90);
  });

  let players = Array.from(playerMap.values()).filter((player) => player.minutes90 > 0 || player.goalkeeperMinutes90 > 0);

  players = scoreRows(players, [
    { key: "goalsPer90", weight: 1.5 },
    { key: "shotsOnTargetPer90", weight: 1.1 },
    { key: "goalsPerShot", weight: 0.8 },
  ], "finishingIndex");

  players = scoreRows(players, [
    { key: "assistsPer90", weight: 1.2 },
    { key: "xgAssistNet", weight: 1.1 },
    { key: "gcaPer90", weight: 1.1 },
    { key: "passesIntoPenaltyArea", weight: 0.9 },
    { key: "crossesIntoPenaltyArea", weight: 0.7 },
  ], "playmakerIndex");

  players = scoreRows(players, [
    { key: "passesProgressiveDistance", weight: 1 },
    { key: "passesIntoFinalThird", weight: 1 },
    { key: "carriesProgressiveDistance", weight: 1.1 },
    { key: "carriesIntoPenaltyArea", weight: 0.9 },
  ], "progressionIndex");

  players = scoreRows(players, [
    { key: "tacklesWon", weight: 1.1 },
    { key: "interceptions", weight: 1.2 },
    { key: "blocks", weight: 0.9 },
    { key: "clearances", weight: 0.8 },
  ], "ballWinningIndex");

  players = scoreRows(players, [
    { key: "savePct", weight: 1.2 },
    { key: "cleanSheetsPct", weight: 1 },
    { key: "goalsAgainstPer90", invert: true, weight: 1.2 },
  ], "goalkeeperIndex");

  players = scoreRows(players, [
    { key: "finishingIndex", weight: 1 },
    { key: "playmakerIndex", weight: 1 },
    { key: "progressionIndex", weight: 0.9 },
    { key: "ballWinningIndex", weight: 0.85 },
    { key: "goalkeeperIndex", weight: 1.3 },
  ], "overallIndex");

  players = scoreRows(players, [
    { key: "minutes90", weight: 1.3 },
    { key: "starts", weight: 1 },
    { key: "pointsPerGame", weight: 0.7 },
    { key: "plusMinusPer90", weight: 0.6 },
  ], "usageIndex");

  players = players
    .map((player) => ({ ...player, profileBlurb: buildPlayerProfile(player) }))
    .sort((left, right) => right.overallIndex - left.overallIndex);

  const teamMap = new Map<string, TeamAnalyticsRecord>();

  for (const row of teamSources.get("standard") ?? []) {
    const team = toText(row.team);
    if (!team) continue;

    teamMap.set(team, {
      team,
      avgAge: toNullableNumber(row.avg_age),
      possession: toNumber(row.possession),
      goals: toNumber(row.goals),
      goalsPer90: toNumber(row.goals_per90),
      assists: toNumber(row.assists),
      assistsPer90: toNumber(row.assists_per90),
      shots: 0,
      shotsOnTarget: 0,
      shotsPer90: 0,
      shotsOnTargetPct: 0,
      goalsPerShot: 0,
      passesCompleted: 0,
      passesPct: 0,
      passesProgressiveDistance: 0,
      passesIntoFinalThird: 0,
      passesIntoPenaltyArea: 0,
      xgAssistNet: 0,
      sca: 0,
      scaPer90: 0,
      gca: 0,
      gcaPer90: 0,
      tacklesWon: 0,
      challengesPct: 0,
      blocks: 0,
      interceptions: 0,
      clearances: 0,
      errors: 0,
      saves: 0,
      savePct: 0,
      cleanSheetsPct: 0,
      goalsAgainstPer90: 0,
      offenseIndex: 0,
      defenseIndex: 0,
      controlIndex: 0,
      overallIndex: 0,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      lastFive: "",
      roster: [],
      gameLog: [],
    });
  }

  const mergeTeamMetrics = (rows: CsvRow[], merge: (team: TeamAnalyticsRecord, row: CsvRow) => void) => {
    for (const row of rows) {
      const name = toText(row.team);
      if (!name) continue;
      const team = teamMap.get(name);
      if (!team) continue;
      merge(team, row);
    }
  };

  mergeTeamMetrics(teamSources.get("shooting") ?? [], (team, row) => {
    team.shots = toNumber(row.shots);
    team.shotsOnTarget = toNumber(row.shots_on_target);
    team.shotsPer90 = toNumber(row.shots_per90);
    team.shotsOnTargetPct = toNumber(row.shots_on_target_pct);
    team.goalsPerShot = toNumber(row.goals_per_shot);
  });

  mergeTeamMetrics(teamSources.get("passing") ?? [], (team, row) => {
    team.passesCompleted = toNumber(row.passes_completed);
    team.passesPct = toNumber(row.passes_pct);
    team.passesProgressiveDistance = toNumber(row.passes_progressive_distance);
    team.passesIntoFinalThird = toNumber(row.passes_into_final_third);
    team.passesIntoPenaltyArea = toNumber(row.passes_into_penalty_area);
    team.xgAssistNet = toNumber(row.xg_assist_net);
  });

  mergeTeamMetrics(teamSources.get("goal_shot_creation") ?? [], (team, row) => {
    team.sca = toNumber(row.sca);
    team.scaPer90 = toNumber(row.sca_per90);
    team.gca = toNumber(row.gca);
    team.gcaPer90 = toNumber(row.gca_per90);
  });

  mergeTeamMetrics(teamSources.get("defense") ?? [], (team, row) => {
    team.tacklesWon = toNumber(row.tackles_won);
    team.challengesPct = toNumber(row.challenge_tackles_pct);
    team.blocks = toNumber(row.blocks);
    team.interceptions = toNumber(row.interceptions);
    team.clearances = toNumber(row.clearances);
    team.errors = toNumber(row.errors);
  });

  mergeTeamMetrics(teamSources.get("keeper") ?? [], (team, row) => {
    team.saves = toNumber(row.gk_saves);
    team.savePct = toNumber(row.gk_save_pct);
    team.cleanSheetsPct = toNumber(row.gk_clean_sheets_pct);
    team.goalsAgainstPer90 = toNumber(row.gk_goals_against_per90);
  });

  const fixtures: FixtureAnalyticsRecord[] = sortByDateDesc(
    scheduleRows
      .map((row: CsvRow) => {
        const { homeGoals, awayGoals } = parseScore(toText(row.score));
        const homeTeam = toText(row.home_team);
        const awayTeam = toText(row.away_team);
        const matchKey = buildFixtureKey(row);
        const winner =
          homeGoals === null || awayGoals === null
            ? null
            : homeGoals === awayGoals
              ? "Draw"
              : homeGoals > awayGoals
                ? homeTeam
                : awayTeam;

        return {
          matchKey,
          date: toText(row.date),
          dateLabel: formatDateLabel(toText(row.date)),
          round: toText(row.round) || null,
          gameweek: toNullableNumber(row.gameweek),
          homeTeam,
          awayTeam,
          homeGoals,
          awayGoals,
          attendance: toNullableNumber(row.attendance),
          venue: toText(row.venue) || null,
          referee: toText(row.referee) || null,
          resultLabel:
            homeGoals === null || awayGoals === null
              ? "Scheduled"
              : `${homeGoals}-${awayGoals}`,
          winner,
          profileEdge: "",
          recapTag: "",
        };
      })
      .filter((fixture) => fixture.homeTeam && fixture.awayTeam)
  );

  const logsByTeam = new Map<string, TeamGameLogEntry[]>();

  for (const fixture of [...fixtures].reverse()) {
    const homeEntry: TeamGameLogEntry = {
      matchKey: fixture.matchKey,
      team: fixture.homeTeam,
      opponent: fixture.awayTeam,
      date: fixture.date,
      venue: "Home",
      round: fixture.round,
      gameweek: fixture.gameweek,
      goalsFor: fixture.homeGoals,
      goalsAgainst: fixture.awayGoals,
      result:
        fixture.homeGoals === null || fixture.awayGoals === null
          ? "TBD"
          : fixture.homeGoals > fixture.awayGoals
            ? "W"
            : fixture.homeGoals < fixture.awayGoals
              ? "L"
              : "D",
    };

    const awayEntry: TeamGameLogEntry = {
      matchKey: fixture.matchKey,
      team: fixture.awayTeam,
      opponent: fixture.homeTeam,
      date: fixture.date,
      venue: "Away",
      round: fixture.round,
      gameweek: fixture.gameweek,
      goalsFor: fixture.awayGoals,
      goalsAgainst: fixture.homeGoals,
      result:
        fixture.homeGoals === null || fixture.awayGoals === null
          ? "TBD"
          : fixture.awayGoals > fixture.homeGoals
            ? "W"
            : fixture.awayGoals < fixture.homeGoals
              ? "L"
              : "D",
    };

    logsByTeam.set(homeEntry.team, [...(logsByTeam.get(homeEntry.team) ?? []), homeEntry]);
    logsByTeam.set(awayEntry.team, [...(logsByTeam.get(awayEntry.team) ?? []), awayEntry]);
  }

  let teams = Array.from(teamMap.values()).map((team) => {
    const roster = players
      .filter((player) => player.team === team.team)
      .sort((left, right) => right.minutes90 - left.minutes90);

    const log = logsByTeam.get(team.team) ?? [];
    const finished = log.filter((entry) => entry.result !== "TBD");
    const wins = finished.filter((entry) => entry.result === "W").length;
    const draws = finished.filter((entry) => entry.result === "D").length;
    const losses = finished.filter((entry) => entry.result === "L").length;
    const goalsFor = finished.reduce((sum, entry) => sum + (entry.goalsFor ?? 0), 0);
    const goalsAgainst = finished.reduce((sum, entry) => sum + (entry.goalsAgainst ?? 0), 0);

    return {
      ...team,
      roster,
      gameLog: log,
      matchesPlayed: finished.length,
      wins,
      draws,
      losses,
      points: wins * 3 + draws,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      lastFive: finished.slice(-5).map((entry) => entry.result).join(""),
    };
  });

  teams = scoreRows(teams, [
    { key: "goalsPer90", weight: 1.3 },
    { key: "shotsPer90", weight: 1 },
    { key: "gcaPer90", weight: 1.1 },
    { key: "scaPer90", weight: 1.05 },
    { key: "xgAssistNet", weight: 0.9 },
  ], "offenseIndex");

  teams = scoreRows(teams, [
    { key: "goalsAgainstPer90", invert: true, weight: 1.3 },
    { key: "savePct", weight: 0.9 },
    { key: "cleanSheetsPct", weight: 1 },
    { key: "interceptions", weight: 1 },
    { key: "challengesPct", weight: 0.9 },
    { key: "errors", invert: true, weight: 0.8 },
  ], "defenseIndex");

  teams = scoreRows(teams, [
    { key: "possession", weight: 1 },
    { key: "passesPct", weight: 1 },
    { key: "passesProgressiveDistance", weight: 1 },
    { key: "passesIntoFinalThird", weight: 1 },
  ], "controlIndex");

  teams = scoreRows(teams, [
    { key: "offenseIndex", weight: 1 },
    { key: "defenseIndex", weight: 1 },
    { key: "controlIndex", weight: 0.8 },
    { key: "points", weight: 1.2 },
  ], "overallIndex");

  teams = teams.sort((left, right) => right.overallIndex - left.overallIndex);

  const teamLookup = new Map(teams.map((team) => [team.team, team]));

  const enrichedFixtures: FixtureAnalyticsRecord[] = fixtures.map((fixture) => {
    const home = teamLookup.get(fixture.homeTeam);
    const away = teamLookup.get(fixture.awayTeam);
    const profileDelta = rounded((home?.overallIndex ?? 0) - (away?.overallIndex ?? 0));
    const profileEdge =
      profileDelta > 0.4
        ? `${fixture.homeTeam} profile edge`
        : profileDelta < -0.4
          ? `${fixture.awayTeam} profile edge`
          : "Even profile";

    let recapTag = "Profile held";

    if (fixture.homeGoals !== null && fixture.awayGoals !== null) {
      const totalGoals = fixture.homeGoals + fixture.awayGoals;
      if (fixture.winner === "Draw") {
        recapTag = totalGoals >= 4 ? "Open draw" : "Stalemate";
      } else if (totalGoals >= 5) {
        recapTag = "Goal rush";
      } else if (
        (profileDelta > 0.4 && fixture.winner === fixture.awayTeam) ||
        (profileDelta < -0.4 && fixture.winner === fixture.homeTeam)
      ) {
        recapTag = "Upset";
      } else if (Math.abs((fixture.homeGoals ?? 0) - (fixture.awayGoals ?? 0)) >= 3) {
        recapTag = "One-sided";
      }
    }

    return {
      ...fixture,
      profileEdge,
      recapTag,
    };
  });

  const finishedFixtures = enrichedFixtures.filter(
    (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null
  );
  const upcomingFixtures = enrichedFixtures.filter(
    (fixture) => fixture.homeGoals === null || fixture.awayGoals === null
  );

  return {
    season,
    availableSeasons,
    dataSources: [
      `FBref ${season} player, team, keeper, and fixture aggregates`,
      "Official club roster names from merged player stat tables",
    ],
    players,
    teams,
    goalkeepers: players
      .filter((player) => player.isGoalkeeper)
      .sort((left, right) => right.goalkeeperIndex - left.goalkeeperIndex),
    fixtures: enrichedFixtures,
    recentRecaps: finishedFixtures.slice(0, 8),
    previewFixtures: (upcomingFixtures.length > 0 ? upcomingFixtures : finishedFixtures).slice(0, 8),
    playerUsageBoard: [...players]
      .sort((left, right) => right.usageIndex - left.usageIndex)
      .slice(0, 24),
    glossary: [
      {
        term: "Finishing index",
        definition:
          "Composite of goals per 90, shots on target per 90, and finishing efficiency. Higher means a more dangerous volume scorer.",
      },
      {
        term: "Playmaker index",
        definition:
          "Blend of assists, xG assisted, goal-creating actions, and penalty-area passing volume. Higher means a stronger chance-creation profile.",
      },
      {
        term: "Progression index",
        definition:
          "Blend of progressive passing distance, entries into the final third, and carries into danger zones. Higher means a stronger ball-progressor.",
      },
      {
        term: "Ball-winning index",
        definition:
          "Blend of tackles won, interceptions, blocks, and clearances. Higher means a stronger defensive event profile.",
      },
      {
        term: "Control index",
        definition:
          "Team-level blend of possession, pass completion, and progressive passing volume. Higher means a stronger territory-and-possession profile.",
      },
      {
        term: "Profile edge",
        definition:
          "Fixture shorthand comparing each team’s season-long offense, defense, control, and point output. It is a style edge, not a match prediction model.",
      },
    ],
  } satisfies AnalyticsHubData;
});
