import fs from "node:fs/promises";
import path from "node:path";
import { calculateAggregateFantasyScore } from "../src/lib/scoring/scoring-engine";
import { launchScoringRules } from "../src/lib/scoring/scoring-rules";
import type { PlayerPosition } from "../src/types/fantasy";

interface OfficialTeamRecord {
  teamId: string;
  shortName?: string;
  officialName?: string;
  mediaName?: string;
}

interface OfficialRosterPlayerRecord {
  playerId: string;
  role: number;
  roleLabel?: string;
  playerStatus?: string;
  mediaFirstName?: string;
  mediaLastName?: string;
  displayName?: string;
  shortName?: string;
}

interface OfficialStatValueRecord {
  statsId: string;
  statsValue: number | null;
}

interface OfficialStatsPlayerRecord {
  playerId: string;
  stats?: OfficialStatValueRecord[];
}

interface OfficialStatsResponse {
  players?: OfficialStatsPlayerRecord[];
  pagination?: {
    totalPages?: number;
  };
}

const ROSTER_SEASON_ID =
  "nwsl::Football_Season::0b6761e4701749f593690c0f338da74c";
const SCORING_SEASON_ID =
  "nwsl::Football_Season::fad050beee834db88fa9f2eb28ce5a5c";
const OUTPUT_FILE = path.join(
  process.cwd(),
  "src/lib/generated/fantasy-player-pool.generated.ts"
);

const positionSalaryPremium: Record<PlayerPosition, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

type CategoryName = "general" | "passing" | "defending" | "goalkeeping";
type StatMapsByCategory = Record<CategoryName, Map<string, number>>;

function normalizeStatId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createStatMap(stats: OfficialStatValueRecord[] = []) {
  const map = new Map<string, number>();

  for (const stat of stats) {
    map.set(normalizeStatId(stat.statsId), Number(stat.statsValue ?? 0));
  }

  return map;
}

function mapPosition(roleLabel: string | undefined, role: number) {
  const normalizedLabel = String(roleLabel ?? "").toLowerCase();

  if (role === 1 || normalizedLabel.includes("goal")) {
    return "GK";
  }

  if (role === 2 || normalizedLabel.includes("def")) {
    return "DEF";
  }

  if (role === 3 || normalizedLabel.includes("mid")) {
    return "MID";
  }

  return "FWD";
}

function getAvailability(playerStatus: string | undefined) {
  const normalizedStatus = String(playerStatus ?? "").toLowerCase();

  if (normalizedStatus.includes("active")) {
    return "available";
  }

  if (
    normalizedStatus.includes("question") ||
    normalizedStatus.includes("doubt") ||
    normalizedStatus.includes("day")
  ) {
    return "questionable";
  }

  return normalizedStatus ? "out" : "available";
}

function getStablePlayerId(officialPlayerId: string) {
  return officialPlayerId.split("::").pop() ?? officialPlayerId;
}

function getStatValue(
  statMaps: StatMapsByCategory,
  categoryPriority: CategoryName[],
  statIds: string[],
  fallback = 0
) {
  for (const category of categoryPriority) {
    for (const statId of statIds) {
      const value = statMaps[category].get(normalizeStatId(statId));
      if (typeof value === "number" && !Number.isNaN(value)) {
        return value;
      }
    }
  }

  return fallback;
}

function getStatMax(
  statMaps: StatMapsByCategory,
  categoryPriority: CategoryName[],
  statIds: string[]
) {
  let maxValue = 0;

  for (const category of categoryPriority) {
    for (const statId of statIds) {
      const value = statMaps[category].get(normalizeStatId(statId));
      if (typeof value === "number" && !Number.isNaN(value)) {
        maxValue = Math.max(maxValue, value);
      }
    }
  }

  return maxValue;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchTeams() {
  const data = await fetchJson<{ teams?: OfficialTeamRecord[] }>(
    `https://api-sdp.nwslsoccer.com/v1/nwsl/football/seasons/${ROSTER_SEASON_ID}/teams?locale=en-US`
  );

  return data.teams ?? [];
}

async function fetchRoster(teamId: string) {
  const data = await fetchJson<{ players?: OfficialRosterPlayerRecord[] }>(
    `https://api-sdp.nwslsoccer.com/v1/nwsl/football/teams/${teamId}/roster?locale=en-US&seasonId=${ROSTER_SEASON_ID}`
  );

  return data.players ?? [];
}

async function fetchAllStats(category: CategoryName) {
  const players: OfficialStatsPlayerRecord[] = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const data = await fetchJson<OfficialStatsResponse>(
      `https://api-sdp.nwslsoccer.com/v1/nwsl/football/seasons/${SCORING_SEASON_ID}/stats/players?locale=en-US&category=${category}&page=${currentPage}&pageNumElement=100`
    );

    players.push(...(data.players ?? []));
    totalPages = data.pagination?.totalPages ?? currentPage;
    currentPage += 1;
  } while (currentPage <= totalPages);

  return players;
}

function computeProjectionInputs(
  position: PlayerPosition,
  statMaps: StatMapsByCategory
) {
  const appearances = Math.max(
    getStatValue(statMaps, ["general"], ["games-played", "Appearances"]),
    0
  );
  const starts = Math.min(
    appearances,
    Math.max(getStatValue(statMaps, ["general"], ["Starts"]), 0)
  );
  const minutes = getStatValue(statMaps, ["general"], ["minutes-played", "Time Played"]);
  const goals = getStatValue(statMaps, ["general"], ["goals", "Goals"]);
  const assists = getStatValue(statMaps, ["general"], ["assists", "Assists (Intentional)"]);
  const shots = getStatValue(statMaps, ["general"], ["total-scoring-attempts", "Total Shots"]);
  const shotsOnTarget = getStatValue(statMaps, ["general"], [
    "on-target-scoring-attempts",
    "Shots On Target ( inc goals )",
  ]);
  const chancesCreated = getStatValue(statMaps, ["passing", "general"], [
    "total-attacking-assist",
    "Key Passes (Attempt Assists)",
  ]);
  const successfulPasses = getStatValue(statMaps, ["passing", "general"], [
    "accurate-pass",
    "Total Successful Passes ( Excl Crosses & Corners ) ",
    "Total Successful Passes ( Excl Crosses & Corners )",
  ]);
  const successfulCrosses = getStatMax(statMaps, ["passing", "general"], [
    "cross",
    "Successful Crosses open play",
    "Successful Crosses & Corners",
  ]);
  const foulsWon = getStatValue(statMaps, ["general"], [
    "fouls-suffered",
    "Total Fouls Won",
  ]);
  const foulsCommitted = getStatValue(statMaps, ["general"], [
    "fouls-committed",
    "Total Fouls Conceded",
  ]);
  const tacklesWon = getStatValue(statMaps, ["defending", "general"], [
    "tackle",
    "tackles-won",
    "Tackles Won",
  ]);
  const interceptions = getStatValue(statMaps, ["defending", "general"], [
    "interception",
    "Interceptions",
  ]);
  const blocks = getStatValue(statMaps, ["general"], ["Blocked Shots"]);
  const cleanSheets = getStatValue(
    statMaps,
    ["goalkeeping", "general"],
    ["clean-sheets", "Clean Sheets"]
  );
  const saves = getStatValue(statMaps, ["goalkeeping", "general"], [
    "saves",
    "Saves Made",
  ]);
  const goalsConceded = getStatValue(statMaps, ["goalkeeping", "general"], [
    "goals-conceded",
    "Goals Conceded",
  ]);
  const yellowCards = getStatValue(statMaps, ["general"], [
    "yellow-cards",
    "Yellow Cards",
  ]);
  const redCards = getStatValue(statMaps, ["general"], [
    "red-cards",
    "Straight Red Cards",
    "Total Red Cards",
  ]);
  const penaltyConceded = getStatValue(
    statMaps,
    ["goalkeeping", "general"],
    ["penalty-conceded", "penalties-conceded", "Penalties Conceded"]
  );
  const penaltiesSaved = getStatValue(
    statMaps,
    ["goalkeeping", "general"],
    ["penalties-saved", "Penalties Saved", "Saves from Penalty"]
  );
  const penaltyAttempts = getStatValue(statMaps, ["general"], [
    "penalty-attempts",
    "Penalty Attempts",
  ]);
  const penaltiesSuccessful = getStatValue(statMaps, ["general"], [
    "penalties-successful",
    "Penalties Successful",
  ]);
  const penaltyMisses = Math.max(0, penaltyAttempts - penaltiesSuccessful);

  const aggregateInput = {
    position,
    appearances,
    sixtyPlusAppearances: starts,
    goals,
    assists,
    shots,
    shotsOnTarget,
    chancesCreated,
    successfulPasses,
    successfulCrosses,
    foulsWon,
    foulsCommitted,
    tacklesWon,
    interceptions,
    blocks,
    cleanSheets,
    saves,
    goalsConceded,
    yellowCards,
    redCards,
    penaltySaves: penaltiesSaved,
    penaltyMisses,
    penaltyConceded,
    ownGoals: 0,
    goalkeeperWins: 0,
    goalkeeperDraws: 0,
  } as const;

  return {
    aggregateInput,
    appearances,
    starts,
    minutes,
    goals,
    assists,
    shots,
    shotsOnTarget,
    chancesCreated,
    successfulPasses,
    successfulCrosses,
    foulsWon,
    foulsCommitted,
    tacklesWon,
    interceptions,
    blocks,
    cleanSheets,
    saves,
    goalsConceded,
    yellowCards,
    redCards,
    penaltyConceded,
    penaltyMisses,
    penaltySaves: penaltiesSaved,
  };
}

async function main() {
  const [teams, generalStats, passingStats, defendingStats, goalkeepingStats] =
    await Promise.all([
      fetchTeams(),
      fetchAllStats("general"),
      fetchAllStats("passing"),
      fetchAllStats("defending"),
      fetchAllStats("goalkeeping"),
    ]);

  const statsByCategory: Record<CategoryName, Map<string, Map<string, number>>> = {
    general: new Map(generalStats.map((player) => [player.playerId, createStatMap(player.stats)])),
    passing: new Map(passingStats.map((player) => [player.playerId, createStatMap(player.stats)])),
    defending: new Map(
      defendingStats.map((player) => [player.playerId, createStatMap(player.stats)])
    ),
    goalkeeping: new Map(
      goalkeepingStats.map((player) => [player.playerId, createStatMap(player.stats)])
    ),
  };

  const rosterGroups = await Promise.all(
    teams.map(async (team) => ({
      team,
      roster: await fetchRoster(team.teamId),
    }))
  );

  const poolRows = rosterGroups.flatMap(({ team, roster }) =>
    roster.map((rosterPlayer) => {
      const position = mapPosition(rosterPlayer.roleLabel, rosterPlayer.role);
      const statMaps: StatMapsByCategory = {
        general: statsByCategory.general.get(rosterPlayer.playerId) ?? new Map(),
        passing: statsByCategory.passing.get(rosterPlayer.playerId) ?? new Map(),
        defending: statsByCategory.defending.get(rosterPlayer.playerId) ?? new Map(),
        goalkeeping: statsByCategory.goalkeeping.get(rosterPlayer.playerId) ?? new Map(),
      };
      const projection = computeProjectionInputs(position, statMaps);
      const scoringResult = calculateAggregateFantasyScore(
        projection.aggregateInput,
        launchScoringRules
      );
      const rawAveragePoints =
        projection.appearances > 0
          ? scoringResult.total / projection.appearances
          : 0;

      return {
        id: getStablePlayerId(rosterPlayer.playerId),
        official_player_id: rosterPlayer.playerId,
        display_name:
          `${rosterPlayer.mediaFirstName ?? ""} ${rosterPlayer.mediaLastName ?? ""}`.trim() ||
          rosterPlayer.displayName ||
          rosterPlayer.shortName ||
          "Unknown Player",
        club_name:
          team.mediaName || team.officialName || team.shortName || "NWSL Club",
        position,
        average_points: 0,
        salary_cost: 0,
        availability: getAvailability(rosterPlayer.playerStatus),
        rank: 0,
        stats_source_season: "2025 NWSL regular season",
        appearances_2025: projection.appearances,
        starts_2025: projection.starts,
        minutes_2025: projection.minutes,
        goals_2025: projection.goals,
        assists_2025: projection.assists,
        shots_2025: projection.shots,
        shots_on_target_2025: projection.shotsOnTarget,
        chances_created_2025: projection.chancesCreated,
        successful_passes_2025: projection.successfulPasses,
        successful_crosses_2025: projection.successfulCrosses,
        fouls_won_2025: projection.foulsWon,
        fouls_committed_2025: projection.foulsCommitted,
        tackles_won_2025: projection.tacklesWon,
        interceptions_2025: projection.interceptions,
        blocks_2025: projection.blocks,
        clean_sheets_2025: projection.cleanSheets,
        saves_2025: projection.saves,
        goals_conceded_2025: projection.goalsConceded,
        yellow_cards_2025: projection.yellowCards,
        red_cards_2025: projection.redCards,
        penalty_conceded_2025: projection.penaltyConceded,
        penalty_misses_2025: projection.penaltyMisses,
        penalty_saves_2025: projection.penaltySaves,
        raw_average_points_2025: Number(rawAveragePoints.toFixed(3)),
      };
    })
  );

  const positionBaselines: Record<PlayerPosition, number> = {
    GK: 3,
    DEF: 3,
    MID: 3,
    FWD: 3,
  };

  for (const position of Object.keys(positionBaselines) as PlayerPosition[]) {
    const eligibleAverages = poolRows
      .filter(
        (player) =>
          player.position === position &&
          player.appearances_2025 >= 4 &&
          player.raw_average_points_2025 > 0
      )
      .map((player) => player.raw_average_points_2025);

    if (eligibleAverages.length > 0) {
      positionBaselines[position] =
        eligibleAverages.reduce((sum, value) => sum + value, 0) /
        eligibleAverages.length;
    }
  }

  const projectedRows = poolRows.map((player) => {
    const sampleWeight = Math.min(player.appearances_2025 / 8, 1);
    const baseline = positionBaselines[player.position as PlayerPosition];
    const smoothedAverage =
      player.raw_average_points_2025 * sampleWeight + baseline * (1 - sampleWeight);
    const samplePenalty =
      player.appearances_2025 === 0 ? 0.6 : player.appearances_2025 < 4 ? 0.3 : 0;

    return {
      ...player,
      average_points: Number(Math.max(2.5, smoothedAverage - samplePenalty).toFixed(1)),
    };
  });

  const overallAverage =
    projectedRows.reduce((sum, player) => sum + player.average_points, 0) /
    projectedRows.length;

  const officialFantasyPlayerPool = projectedRows
    .sort((left, right) => {
      if (right.average_points !== left.average_points) {
        return right.average_points - left.average_points;
      }

      if (right.appearances_2025 !== left.appearances_2025) {
        return right.appearances_2025 - left.appearances_2025;
      }

      return left.display_name.localeCompare(right.display_name);
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1,
      salary_cost: Math.max(
        6,
        Math.min(
          22,
          Math.round(
              9 +
              (player.average_points - overallAverage) * 1.35 +
              positionSalaryPremium[player.position as PlayerPosition]
          )
        )
      ),
    }));

  const fileContents = `import type { FantasyPoolPlayer } from "@/types/fantasy";

export interface OfficialFantasyPoolPlayerRecord extends FantasyPoolPlayer {
  official_player_id: string;
  stats_source_season: string;
  appearances_2025: number;
  starts_2025: number;
  minutes_2025: number;
  goals_2025: number;
  assists_2025: number;
  shots_2025: number;
  shots_on_target_2025: number;
  chances_created_2025: number;
  successful_passes_2025: number;
  successful_crosses_2025: number;
  fouls_won_2025: number;
  fouls_committed_2025: number;
  tackles_won_2025: number;
  interceptions_2025: number;
  blocks_2025: number;
  clean_sheets_2025: number;
  saves_2025: number;
  goals_conceded_2025: number;
  yellow_cards_2025: number;
  red_cards_2025: number;
  penalty_conceded_2025: number;
  penalty_misses_2025: number;
  penalty_saves_2025: number;
  raw_average_points_2025: number;
}

export const officialFantasyPlayerPoolSource = {
  rosterSeason: "2026 NWSL roster",
  scoringSeason: "2025 NWSL regular season",
  generatedAt: ${JSON.stringify(new Date().toISOString())},
} as const;

export const officialFantasyPlayerPool: OfficialFantasyPoolPlayerRecord[] = ${JSON.stringify(
    officialFantasyPlayerPool,
    null,
    2
  )};
`;

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, fileContents);

  console.log(
    `Synced ${officialFantasyPlayerPool.length} official players to ${OUTPUT_FILE}`
  );
  console.log(
    officialFantasyPlayerPool
      .slice(0, 10)
      .map(
        (player) =>
          `${player.rank}. ${player.display_name} (${player.club_name}) ${player.average_points} pts $${player.salary_cost}`
      )
      .join("\n")
  );
}

await main();
