import { cache } from "react";
import type { TeamAnalyticsRecord, PlayerAnalyticsRecord } from "@/lib/analytics/fbref";
import { getAnalyticsHubData, type MultiSourceAnalyticsHubData } from "@/lib/analytics/hub";
import {
  officialFantasyPlayerPool,
  type OfficialFantasyPoolPlayerRecord,
} from "@/lib/generated/fantasy-player-pool.generated";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type { AvailabilityStatus, PlayerPosition } from "@/types/fantasy";

interface Range {
  min: number;
  max: number;
}

interface RecentFormSnapshot {
  pointsPerMatch: number;
  goalsForPerMatch: number;
  goalsAgainstPerMatch: number;
  goalDiffPerMatch: number;
}

interface TeamMatchupContext {
  canonicalTeam: string;
  displayTeam: string;
  team: TeamAnalyticsRecord;
  recentForm: RecentFormSnapshot;
}

interface PlayerRateSnapshot {
  goalsPer90: number;
  assistsPer90: number;
  shotsPer90: number;
  shotsOnTargetPer90: number;
  chancesCreatedPer90: number;
  successfulPassesPer90: number;
  successfulCrossesPer90: number;
  tacklesWonPer90: number;
  interceptionsPer90: number;
  blocksPer90: number;
  savesPer90: number;
  goalsConcededPer90: number;
}

export interface FairPriceRecord {
  label: string;
  probability: number;
  decimalOdds: number;
  americanOdds: string;
}

export interface ScorelineRecord {
  home: number;
  away: number;
  probability: number;
}

export interface PlayerProjectionRecord {
  id: string;
  officialPlayerId: string;
  player: string;
  team: string;
  canonicalTeam: string;
  position: PlayerPosition;
  availability: AvailabilityStatus;
  opponent: string | null;
  opponentCanonicalTeam: string | null;
  venue: "Home" | "Away" | null;
  matchDate: string | null;
  matchDateLabel: string | null;
  salary: number;
  rank: number;
  baselineProjection: number;
  projection: number;
  floor: number;
  ceiling: number;
  confidence: number;
  expectedMinutes: number;
  valueScore: number;
  shotVolume: number;
  creationVolume: number;
  defensiveVolume: number;
  cleanSheetChance: number | null;
  winChance: number | null;
  matchupTag: string;
  riskLabel: string;
  trendLabel: string;
  reasons: string[];
}

export interface MatchupPreviewRecord {
  matchKey: string;
  slug: string;
  matchDate: string;
  matchDateLabel: string;
  round: string | null;
  venue: string | null;
  city: string | null;
  homeTeam: string;
  awayTeam: string;
  homeCanonicalTeam: string;
  awayCanonicalTeam: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  lambdaHome: number;
  lambdaAway: number;
  totalGoals: number;
  over25Prob: number;
  bttsYesProb: number;
  homeCleanSheetProb: number;
  awayCleanSheetProb: number;
  confidence: number;
  tempoLabel: string;
  volatilityLabel: string;
  summary: string;
  angles: string[];
  fairPrices: FairPriceRecord[];
  scoreMatrix: number[][];
  topScorelines: ScorelineRecord[];
  homeTargets: PlayerProjectionRecord[];
  awayTargets: PlayerProjectionRecord[];
}

export interface PredictiveSlateBoardRecord {
  label: string;
  value: string;
  detail: string;
}

export interface PredictiveHubData extends MultiSourceAnalyticsHubData {
  predictive: {
    generatedAt: string;
    slateTitle: string;
    matchupBoard: PredictiveSlateBoardRecord[];
    matchups: MatchupPreviewRecord[];
    playerBoard: PlayerProjectionRecord[];
    bestValues: PlayerProjectionRecord[];
    bestCeilings: PlayerProjectionRecord[];
    safestFloors: PlayerProjectionRecord[];
    propTargets: PlayerProjectionRecord[];
  };
}

const TEAM_ALIASES: Record<string, string> = {
  "angel city": "Angel City FC",
  "angel city fc": "Angel City FC",
  "bay fc": "Bay FC",
  "boston legacy": "Boston Legacy",
  "boston legacy fc": "Boston Legacy",
  "chicago stars": "Chicago Stars",
  "chicago stars fc": "Chicago Stars",
  current: "Current",
  "kansas city current": "Current",
  "denver summit": "Denver Summit",
  "denver summit fc": "Denver Summit",
  "gotham fc": "Gotham FC",
  gotham: "Gotham FC",
  "nj ny gotham fc": "Gotham FC",
  "houston dash": "Houston Dash",
  "north carolina courage": "NC Courage",
  "nc courage": "NC Courage",
  "orlando pride": "Orlando Pride",
  "portland thorns": "Portland Thorns",
  "portland thorns fc": "Portland Thorns",
  "racing louisville": "Racing Louisville",
  "racing louisville fc": "Racing Louisville",
  reign: "Reign",
  "seattle reign": "Reign",
  "seattle reign fc": "Reign",
  royals: "Royals",
  "utah royals": "Royals",
  "utah royals fc": "Royals",
  "san diego wave": "SD Wave",
  "san diego wave fc": "SD Wave",
  "sd wave": "SD Wave",
  "washington spirit": "Washington Spirit",
};

const MAX_MATRIX_GOALS = 6;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalizeTeamName(team: string) {
  const normalized = normalizeText(team);
  return TEAM_ALIASES[normalized] ?? team;
}

function slugify(value: string) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scaleIntoRange(value: number, range: Range, outMin: number, outMax: number) {
  if (range.max <= range.min) {
    return (outMin + outMax) / 2;
  }

  const ratio = clamp((value - range.min) / (range.max - range.min), 0, 1);
  return outMin + ratio * (outMax - outMin);
}

function getRange(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 1 } satisfies Range;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  } satisfies Range;
}

function formatShortDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatPercent(probability: number) {
  return `${Math.round(probability * 100)}%`;
}

function decimalToAmericanOdds(probability: number) {
  if (probability <= 0 || probability >= 1) {
    return "N/A";
  }

  if (probability >= 0.5) {
    return `-${Math.round((probability / (1 - probability)) * 100)}`;
  }

  return `+${Math.round(((1 - probability) / probability) * 100)}`;
}

function toFairPrice(label: string, probability: number): FairPriceRecord {
  const safeProbability = clamp(probability, 0.01, 0.99);
  return {
    label,
    probability: round(safeProbability, 4),
    decimalOdds: round(1 / safeProbability, 2),
    americanOdds: decimalToAmericanOdds(safeProbability),
  };
}

function factorial(value: number) {
  let total = 1;
  for (let index = 2; index <= value; index += 1) {
    total *= index;
  }
  return total;
}

function poisson(lambda: number, goals: number) {
  return (Math.exp(-lambda) * lambda ** goals) / factorial(goals);
}

export function buildScoreMatrix(lambdaHome: number, lambdaAway: number) {
  const matrix: number[][] = Array.from({ length: MAX_MATRIX_GOALS + 1 }, () =>
    Array.from({ length: MAX_MATRIX_GOALS + 1 }, () => 0)
  );

  let total = 0;
  for (let homeGoals = 0; homeGoals <= MAX_MATRIX_GOALS; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= MAX_MATRIX_GOALS; awayGoals += 1) {
      const probability = poisson(lambdaHome, homeGoals) * poisson(lambdaAway, awayGoals);
      matrix[homeGoals][awayGoals] = probability;
      total += probability;
    }
  }

  return matrix.map((row) => row.map((value) => value / total));
}

function topScorelines(scoreMatrix: number[][]) {
  const rows: ScorelineRecord[] = [];
  for (let homeGoals = 0; homeGoals < scoreMatrix.length; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals < scoreMatrix[homeGoals].length; awayGoals += 1) {
      rows.push({
        home: homeGoals,
        away: awayGoals,
        probability: scoreMatrix[homeGoals][awayGoals],
      });
    }
  }

  return rows
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 5)
    .map((scoreline) => ({
      ...scoreline,
      probability: round(scoreline.probability, 4),
    }));
}

function scoreMatrixProbabilities(scoreMatrix: number[][]) {
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let over25Prob = 0;
  let bttsYesProb = 0;
  let homeCleanSheetProb = 0;
  let awayCleanSheetProb = 0;

  for (let homeGoals = 0; homeGoals < scoreMatrix.length; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals < scoreMatrix[homeGoals].length; awayGoals += 1) {
      const probability = scoreMatrix[homeGoals][awayGoals];

      if (homeGoals > awayGoals) {
        homeWinProb += probability;
      } else if (homeGoals === awayGoals) {
        drawProb += probability;
      } else {
        awayWinProb += probability;
      }

      if (homeGoals + awayGoals >= 3) {
        over25Prob += probability;
      }

      if (homeGoals > 0 && awayGoals > 0) {
        bttsYesProb += probability;
      }

      if (awayGoals === 0) {
        homeCleanSheetProb += probability;
      }

      if (homeGoals === 0) {
        awayCleanSheetProb += probability;
      }
    }
  }

  return {
    homeWinProb,
    drawProb,
    awayWinProb,
    over25Prob,
    bttsYesProb,
    homeCleanSheetProb,
    awayCleanSheetProb,
  };
}

function buildRecentForm(team: TeamAnalyticsRecord): RecentFormSnapshot {
  const recent = team.gameLog.filter((entry) => entry.result !== "TBD").slice(-5);
  if (recent.length === 0) {
    return {
      pointsPerMatch: 1.3,
      goalsForPerMatch: team.goalsPer90,
      goalsAgainstPerMatch: team.goalsAgainstPer90,
      goalDiffPerMatch: team.goalsPer90 - team.goalsAgainstPer90,
    };
  }

  const wins = recent.filter((entry) => entry.result === "W").length;
  const draws = recent.filter((entry) => entry.result === "D").length;
  const goalsFor = recent.reduce((sum, entry) => sum + (entry.goalsFor ?? 0), 0);
  const goalsAgainst = recent.reduce((sum, entry) => sum + (entry.goalsAgainst ?? 0), 0);

  return {
    pointsPerMatch: round((wins * 3 + draws) / recent.length, 2),
    goalsForPerMatch: round(goalsFor / recent.length, 2),
    goalsAgainstPerMatch: round(goalsAgainst / recent.length, 2),
    goalDiffPerMatch: round((goalsFor - goalsAgainst) / recent.length, 2),
  };
}

function preferredTeamDisplayNames(data: MultiSourceAnalyticsHubData) {
  const map = new Map<string, string>();

  const remember = (value: string) => {
    if (!value) return;
    map.set(canonicalizeTeamName(value), value);
  };

  for (const fixture of data.official.upcomingFixtures) {
    remember(fixture.homeTeam);
    remember(fixture.awayTeam);
  }

  for (const team of data.official.standings) {
    remember(team.team);
  }

  for (const player of officialFantasyPlayerPool) {
    remember(player.club_name);
  }

  for (const team of data.teams) {
    const canonical = canonicalizeTeamName(team.team);
    if (!map.has(canonical)) {
      map.set(canonical, team.team);
    }
  }

  return map;
}

function resolvePlayerPosition(player: OfficialFantasyPoolPlayerRecord) {
  return player.position;
}

function historicalPer90(total: number, minutes: number) {
  if (minutes <= 0) return 0;
  return total / (minutes / 90);
}

function blendRate(current: number | null, historical: number | null, currentWeight: number) {
  const safeCurrent = current ?? 0;
  const safeHistorical = historical ?? 0;

  if (current != null && historical != null) {
    return safeCurrent * currentWeight + safeHistorical * (1 - currentWeight);
  }

  if (current != null) return safeCurrent;
  return safeHistorical;
}

function estimateExpectedMinutes(
  player: OfficialFantasyPoolPlayerRecord,
  analyticsPlayer: PlayerAnalyticsRecord | null,
  currentWeight: number
) {
  const historicalAverage =
    player.appearances_2025 > 0 ? player.minutes_2025 / player.appearances_2025 : 0;
  const currentAverage =
    analyticsPlayer && analyticsPlayer.matches > 0
      ? (analyticsPlayer.minutes90 * 90) / analyticsPlayer.matches
      : 0;
  const historicalStartRate =
    player.appearances_2025 > 0 ? player.starts_2025 / player.appearances_2025 : 0;
  const currentStartRate =
    analyticsPlayer && analyticsPlayer.matches > 0
      ? analyticsPlayer.starts / analyticsPlayer.matches
      : 0;

  const rawMinutes =
    currentAverage > 0 && historicalAverage > 0
      ? currentAverage * currentWeight + historicalAverage * (1 - currentWeight)
      : currentAverage || historicalAverage;
  const startRate =
    currentStartRate > 0 && historicalStartRate > 0
      ? currentStartRate * currentWeight + historicalStartRate * (1 - currentWeight)
      : currentStartRate || historicalStartRate;

  let expectedMinutes = rawMinutes * (0.78 + startRate * 0.28);

  if (player.availability === "questionable") {
    expectedMinutes *= 0.78;
  }

  if (player.availability === "out") {
    expectedMinutes = 0;
  }

  return round(clamp(expectedMinutes, 0, 90), 1);
}

function buildPlayerRates(
  player: OfficialFantasyPoolPlayerRecord,
  analyticsPlayer: PlayerAnalyticsRecord | null,
  currentWeight: number
) {
  const historicalMinutes = player.minutes_2025;
  const historicalRates: PlayerRateSnapshot = {
    goalsPer90: historicalPer90(player.goals_2025, historicalMinutes),
    assistsPer90: historicalPer90(player.assists_2025, historicalMinutes),
    shotsPer90: historicalPer90(player.shots_2025, historicalMinutes),
    shotsOnTargetPer90: historicalPer90(player.shots_on_target_2025, historicalMinutes),
    chancesCreatedPer90: historicalPer90(player.chances_created_2025, historicalMinutes),
    successfulPassesPer90: historicalPer90(player.successful_passes_2025, historicalMinutes),
    successfulCrossesPer90: historicalPer90(player.successful_crosses_2025, historicalMinutes),
    tacklesWonPer90: historicalPer90(player.tackles_won_2025, historicalMinutes),
    interceptionsPer90: historicalPer90(player.interceptions_2025, historicalMinutes),
    blocksPer90: historicalPer90(player.blocks_2025, historicalMinutes),
    savesPer90: historicalPer90(player.saves_2025, historicalMinutes),
    goalsConcededPer90: historicalPer90(player.goals_conceded_2025, historicalMinutes),
  };

  const currentRates: PlayerRateSnapshot | null = analyticsPlayer
    ? {
        goalsPer90: analyticsPlayer.goalsPer90,
        assistsPer90: analyticsPlayer.assistsPer90,
        shotsPer90: analyticsPlayer.shotsPer90,
        shotsOnTargetPer90: analyticsPlayer.shotsOnTargetPer90,
        chancesCreatedPer90: analyticsPlayer.scaPer90 * 0.48,
        successfulPassesPer90:
          analyticsPlayer.minutes90 > 0
            ? analyticsPlayer.passesCompleted / analyticsPlayer.minutes90
            : 0,
        successfulCrossesPer90:
          analyticsPlayer.minutes90 > 0
            ? analyticsPlayer.crossesIntoPenaltyArea / analyticsPlayer.minutes90
            : 0,
        tacklesWonPer90:
          analyticsPlayer.minutes90 > 0 ? analyticsPlayer.tacklesWon / analyticsPlayer.minutes90 : 0,
        interceptionsPer90:
          analyticsPlayer.minutes90 > 0 ? analyticsPlayer.interceptions / analyticsPlayer.minutes90 : 0,
        blocksPer90:
          analyticsPlayer.minutes90 > 0 ? analyticsPlayer.blocks / analyticsPlayer.minutes90 : 0,
        savesPer90: historicalRates.savesPer90,
        goalsConcededPer90: analyticsPlayer.goalsAgainstPer90,
      }
    : null;

  return {
    goalsPer90: blendRate(currentRates?.goalsPer90 ?? null, historicalRates.goalsPer90, currentWeight),
    assistsPer90: blendRate(currentRates?.assistsPer90 ?? null, historicalRates.assistsPer90, currentWeight),
    shotsPer90: blendRate(currentRates?.shotsPer90 ?? null, historicalRates.shotsPer90, currentWeight),
    shotsOnTargetPer90: blendRate(
      currentRates?.shotsOnTargetPer90 ?? null,
      historicalRates.shotsOnTargetPer90,
      currentWeight
    ),
    chancesCreatedPer90: blendRate(
      currentRates?.chancesCreatedPer90 ?? null,
      historicalRates.chancesCreatedPer90,
      currentWeight
    ),
    successfulPassesPer90: blendRate(
      currentRates?.successfulPassesPer90 ?? null,
      historicalRates.successfulPassesPer90,
      currentWeight
    ),
    successfulCrossesPer90: blendRate(
      currentRates?.successfulCrossesPer90 ?? null,
      historicalRates.successfulCrossesPer90,
      currentWeight
    ),
    tacklesWonPer90: blendRate(
      currentRates?.tacklesWonPer90 ?? null,
      historicalRates.tacklesWonPer90,
      currentWeight
    ),
    interceptionsPer90: blendRate(
      currentRates?.interceptionsPer90 ?? null,
      historicalRates.interceptionsPer90,
      currentWeight
    ),
    blocksPer90: blendRate(currentRates?.blocksPer90 ?? null, historicalRates.blocksPer90, currentWeight),
    savesPer90: blendRate(currentRates?.savesPer90 ?? null, historicalRates.savesPer90, currentWeight),
    goalsConcededPer90: blendRate(
      currentRates?.goalsConcededPer90 ?? null,
      historicalRates.goalsConcededPer90,
      currentWeight
    ),
  } satisfies PlayerRateSnapshot;
}

function projectionConfidence(
  player: OfficialFantasyPoolPlayerRecord,
  analyticsPlayer: PlayerAnalyticsRecord | null,
  expectedMinutes: number,
  currentWeight: number
) {
  const historicalStartRate =
    player.appearances_2025 > 0 ? player.starts_2025 / player.appearances_2025 : 0;
  const currentStartRate =
    analyticsPlayer && analyticsPlayer.matches > 0
      ? analyticsPlayer.starts / analyticsPlayer.matches
      : 0;
  const roleStability =
    currentStartRate > 0 && historicalStartRate > 0
      ? currentStartRate * currentWeight + historicalStartRate * (1 - currentWeight)
      : currentStartRate || historicalStartRate;
  const availabilityPenalty =
    player.availability === "questionable" ? 0.12 : player.availability === "out" ? 0.45 : 0;

  return round(
    clamp(0.38 + roleStability * 0.24 + (expectedMinutes / 90) * 0.24 + currentWeight * 0.18 - availabilityPenalty, 0.08, 0.92),
    2
  );
}

function buildTrendLabel(
  projection: number,
  baselineProjection: number,
  availability: AvailabilityStatus,
  confidence: number
) {
  if (availability === "out") return "Unavailable";
  if (availability === "questionable") return "Injury watch";

  if (projection - baselineProjection >= 1.5) {
    return "Rising spot";
  }

  if (baselineProjection - projection >= 1.5) {
    return "Cooling off";
  }

  if (confidence >= 0.74) {
    return "Stable role";
  }

  return "Volatile role";
}

function buildRiskLabel(
  availability: AvailabilityStatus,
  expectedMinutes: number,
  confidence: number,
  cleanSheetChance: number | null
) {
  if (availability === "out") return "Out";
  if (availability === "questionable") return "Minutes risk";
  if (expectedMinutes < 55) return "Bench risk";
  if (cleanSheetChance != null && cleanSheetChance < 0.18) return "Thin floor";
  if (confidence < 0.56) return "Wide range";
  return "Stable";
}

function buildTempoLabel(totalGoals: number) {
  if (totalGoals >= 3.1) return "High-event script";
  if (totalGoals >= 2.5) return "Attack-friendly";
  if (totalGoals <= 2.1) return "Low-event grind";
  return "Balanced game";
}

function buildVolatilityLabel(homeWinProb: number, drawProb: number, awayWinProb: number) {
  const strongestSide = Math.max(homeWinProb, awayWinProb);
  if (strongestSide >= 0.58 && drawProb <= 0.24) return "Clear favorite";
  if (drawProb >= 0.3) return "Draw-heavy";
  if (Math.abs(homeWinProb - awayWinProb) <= 0.08) return "Tight coin flip";
  return "Live both ways";
}

function buildMatchupSummary(
  home: TeamMatchupContext,
  away: TeamMatchupContext,
  totalGoals: number,
  homeWinProb: number,
  awayWinProb: number
) {
  const attackLeader =
    home.team.offenseIndex >= away.team.offenseIndex ? home.displayTeam : away.displayTeam;
  const controlLeader =
    home.team.controlIndex >= away.team.controlIndex ? home.displayTeam : away.displayTeam;
  const defenseLeader =
    home.team.defenseIndex >= away.team.defenseIndex ? home.displayTeam : away.displayTeam;
  const favorite =
    homeWinProb >= awayWinProb ? home.displayTeam : away.displayTeam;
  const paceNote =
    totalGoals >= 2.8
      ? "The total projects above league baseline, so shot volume and goal involvement stay live."
      : "The model leans toward a slower script, so floor and clean-sheet equity matter more than raw shootout upside.";

  return `${favorite} carry the stronger win case, ${attackLeader} bring the cleaner attacking profile, ${controlLeader} are better set to own territory, and ${defenseLeader} show the firmer defensive floor. ${paceNote}`;
}

function buildMatchupAngles(
  homeDisplay: string,
  awayDisplay: string,
  homeWinProb: number,
  awayWinProb: number,
  over25Prob: number,
  bttsYesProb: number,
  homeCleanSheetProb: number,
  awayCleanSheetProb: number
) {
  const angles: string[] = [];

  if (homeWinProb >= 0.52) {
    angles.push(`${homeDisplay} win fair ${decimalToAmericanOdds(homeWinProb)}`);
  } else if (awayWinProb >= 0.47) {
    angles.push(`${awayDisplay} win fair ${decimalToAmericanOdds(awayWinProb)}`);
  } else {
    angles.push(`Draw fair ${decimalToAmericanOdds(clamp(1 / 2.7, 0.01, 0.99))}`);
  }

  if (over25Prob >= 0.55) {
    angles.push(`Over 2.5 fair ${decimalToAmericanOdds(over25Prob)}`);
  } else if (over25Prob <= 0.45) {
    angles.push(`Under 2.5 fair ${decimalToAmericanOdds(1 - over25Prob)}`);
  }

  if (bttsYesProb >= 0.56) {
    angles.push(`BTTS yes fair ${decimalToAmericanOdds(bttsYesProb)}`);
  }

  if (homeCleanSheetProb >= 0.36) {
    angles.push(`${homeDisplay} clean sheet ${formatPercent(homeCleanSheetProb)}`);
  } else if (awayCleanSheetProb >= 0.36) {
    angles.push(`${awayDisplay} clean sheet ${formatPercent(awayCleanSheetProb)}`);
  }

  return angles.slice(0, 4);
}

function buildPlayerReasons(
  player: OfficialFantasyPoolPlayerRecord,
  rates: PlayerRateSnapshot,
  projection: number,
  expectedMinutes: number,
  matchup: MatchupPreviewRecord | null,
  isHome: boolean | null
) {
  const reasons: string[] = [];

  if (rates.goalsPer90 >= 0.42 || rates.shotsPer90 >= 2.8) {
    reasons.push("Shot volume keeps a real scoring ceiling.");
  }

  if (rates.chancesCreatedPer90 >= 2.1 || rates.assistsPer90 >= 0.24) {
    reasons.push("Chance creation supports assist equity and floor.");
  }

  if (rates.tacklesWonPer90 + rates.interceptionsPer90 >= 4) {
    reasons.push("Defensive actions keep the floor alive even without a goal.");
  }

  if (
    matchup &&
    (player.position === "GK" || player.position === "DEF") &&
    ((isHome ? matchup.homeCleanSheetProb : matchup.awayCleanSheetProb) >= 0.32)
  ) {
    reasons.push("Clean-sheet equity materially boosts the floor.");
  }

  if (matchup && projection >= player.average_points + 1.2) {
    reasons.push("The matchup upgrades the baseline versus a normal slate spot.");
  }

  if (expectedMinutes < 55) {
    reasons.push("Minutes are the main swing factor.");
  }

  if (player.availability === "questionable") {
    reasons.push("Availability note adds late risk.");
  }

  return reasons.slice(0, 3);
}

function matchupTagForPlayer(
  position: PlayerPosition,
  matchup: MatchupPreviewRecord | null,
  isHome: boolean | null
) {
  if (!matchup || isHome == null) {
    return "No live slate tag";
  }

  const teamWinProb = isHome ? matchup.homeWinProb : matchup.awayWinProb;
  const cleanSheetProb = isHome ? matchup.homeCleanSheetProb : matchup.awayCleanSheetProb;

  if ((position === "GK" || position === "DEF") && cleanSheetProb >= 0.34) {
    return "Best clean-sheet spot";
  }

  if ((position === "FWD" || position === "MID") && matchup.totalGoals >= 2.9) {
    return "Best total";
  }

  if (teamWinProb >= 0.55) {
    return "Favorite";
  }

  if (matchup.totalGoals <= 2.2) {
    return "Low-event floor";
  }

  return "Neutral spot";
}

function candidateFixtures(data: MultiSourceAnalyticsHubData) {
  if (data.official.upcomingFixtures.length > 0) {
    return data.official.upcomingFixtures.map((fixture) => ({
      matchKey: fixture.matchId,
      matchDate: fixture.matchDateUtc,
      matchDateLabel: formatShortDate(fixture.matchDateUtc),
      round: fixture.round || null,
      venue: fixture.stadium || null,
      city: fixture.city || null,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
    }));
  }

  return data.previewFixtures.map((fixture) => ({
    matchKey: fixture.matchKey,
    matchDate: fixture.date,
    matchDateLabel: fixture.dateLabel,
    round: fixture.round,
    venue: fixture.venue,
    city: null,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
  }));
}

export const getPredictiveHubData = cache(async (requestedSeason?: number) => {
  const data = await getAnalyticsHubData(requestedSeason);
  const displayNames = preferredTeamDisplayNames(data);
  const teamRanges = {
    offense: getRange(data.teams.map((team) => team.offenseIndex)),
    defense: getRange(data.teams.map((team) => team.defenseIndex)),
    control: getRange(data.teams.map((team) => team.controlIndex)),
  };

  const leagueGoalsPer90 = average(data.teams.map((team) => team.goalsPer90));
  const leagueGoalsAgainstPer90 = average(data.teams.map((team) => team.goalsAgainstPer90));
  const leagueShotsPer90 = average(data.teams.map((team) => team.shotsPer90));

  const teamContexts = new Map<string, TeamMatchupContext>(
    data.teams.map((team) => {
      const canonicalTeam = canonicalizeTeamName(team.team);
      return [
        canonicalTeam,
        {
          canonicalTeam,
          displayTeam: displayNames.get(canonicalTeam) ?? team.team,
          team,
          recentForm: buildRecentForm(team),
        },
      ] as const;
    })
  );

  const matchups: MatchupPreviewRecord[] = candidateFixtures(data)
    .map((fixture) => {
      const homeCanonicalTeam = canonicalizeTeamName(fixture.homeTeam);
      const awayCanonicalTeam = canonicalizeTeamName(fixture.awayTeam);
      const homeContext = teamContexts.get(homeCanonicalTeam);
      const awayContext = teamContexts.get(awayCanonicalTeam);

      if (!homeContext || !awayContext) {
        return null;
      }

      const homeAttackFactor =
        0.55 * (homeContext.team.goalsPer90 / Math.max(leagueGoalsPer90, 0.1)) +
        0.3 * scaleIntoRange(homeContext.team.offenseIndex, teamRanges.offense, 0.82, 1.22) +
        0.15 * scaleIntoRange(homeContext.team.controlIndex, teamRanges.control, 0.9, 1.12);
      const awayAttackFactor =
        0.55 * (awayContext.team.goalsPer90 / Math.max(leagueGoalsPer90, 0.1)) +
        0.3 * scaleIntoRange(awayContext.team.offenseIndex, teamRanges.offense, 0.82, 1.22) +
        0.15 * scaleIntoRange(awayContext.team.controlIndex, teamRanges.control, 0.9, 1.12);
      const homeDefenseWeakness =
        0.55 * (homeContext.team.goalsAgainstPer90 / Math.max(leagueGoalsAgainstPer90, 0.1)) +
        0.45 * scaleIntoRange(homeContext.team.defenseIndex, teamRanges.defense, 1.18, 0.82);
      const awayDefenseWeakness =
        0.55 * (awayContext.team.goalsAgainstPer90 / Math.max(leagueGoalsAgainstPer90, 0.1)) +
        0.45 * scaleIntoRange(awayContext.team.defenseIndex, teamRanges.defense, 1.18, 0.82);

      const formDelta =
        (homeContext.recentForm.pointsPerMatch - awayContext.recentForm.pointsPerMatch) * 0.07 +
        (homeContext.recentForm.goalDiffPerMatch - awayContext.recentForm.goalDiffPerMatch) * 0.04;

      const lambdaHome = clamp(
        leagueGoalsPer90 *
          homeAttackFactor *
          awayDefenseWeakness *
          (1 + clamp(formDelta, -0.18, 0.18)) *
          1.08,
        0.35,
        3.4
      );
      const lambdaAway = clamp(
        leagueGoalsPer90 *
          awayAttackFactor *
          homeDefenseWeakness *
          (1 - clamp(formDelta * 0.75, -0.14, 0.14)) *
          0.94,
        0.25,
        3.2
      );

      const scoreMatrix = buildScoreMatrix(lambdaHome, lambdaAway);
      const probabilities = scoreMatrixProbabilities(scoreMatrix);
      const totalGoals = round(lambdaHome + lambdaAway, 2);
      const confidence = round(
        clamp(
          0.56 +
            Math.min(homeContext.team.matchesPlayed, awayContext.team.matchesPlayed) / 20 * 0.12 +
            Math.abs(homeContext.team.overallIndex - awayContext.team.overallIndex) * 0.04,
          0.55,
          0.84
        ),
        2
      );

      return {
        matchKey: fixture.matchKey,
        slug: `${slugify(fixture.matchDateLabel || fixture.matchDate)}-${slugify(fixture.homeTeam)}-vs-${slugify(fixture.awayTeam)}`,
        matchDate: fixture.matchDate,
        matchDateLabel: fixture.matchDateLabel,
        round: fixture.round,
        venue: fixture.venue,
        city: fixture.city,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeCanonicalTeam,
        awayCanonicalTeam,
        homeWinProb: round(probabilities.homeWinProb, 4),
        drawProb: round(probabilities.drawProb, 4),
        awayWinProb: round(probabilities.awayWinProb, 4),
        lambdaHome: round(lambdaHome, 2),
        lambdaAway: round(lambdaAway, 2),
        totalGoals,
        over25Prob: round(probabilities.over25Prob, 4),
        bttsYesProb: round(probabilities.bttsYesProb, 4),
        homeCleanSheetProb: round(probabilities.homeCleanSheetProb, 4),
        awayCleanSheetProb: round(probabilities.awayCleanSheetProb, 4),
        confidence,
        tempoLabel: buildTempoLabel(totalGoals),
        volatilityLabel: buildVolatilityLabel(
          probabilities.homeWinProb,
          probabilities.drawProb,
          probabilities.awayWinProb
        ),
        summary: buildMatchupSummary(
          homeContext,
          awayContext,
          totalGoals,
          probabilities.homeWinProb,
          probabilities.awayWinProb
        ),
        angles: buildMatchupAngles(
          fixture.homeTeam,
          fixture.awayTeam,
          probabilities.homeWinProb,
          probabilities.awayWinProb,
          probabilities.over25Prob,
          probabilities.bttsYesProb,
          probabilities.homeCleanSheetProb,
          probabilities.awayCleanSheetProb
        ),
        fairPrices: [
          toFairPrice(`${fixture.homeTeam} win`, probabilities.homeWinProb),
          toFairPrice("Draw", probabilities.drawProb),
          toFairPrice(`${fixture.awayTeam} win`, probabilities.awayWinProb),
          toFairPrice("Over 2.5", probabilities.over25Prob),
          toFairPrice("BTTS yes", probabilities.bttsYesProb),
        ],
        scoreMatrix,
        topScorelines: topScorelines(scoreMatrix),
        homeTargets: [] as PlayerProjectionRecord[],
        awayTargets: [] as PlayerProjectionRecord[],
      } satisfies MatchupPreviewRecord;
    })
    .filter((matchup): matchup is MatchupPreviewRecord => matchup != null)
    .sort((left, right) => new Date(left.matchDate).getTime() - new Date(right.matchDate).getTime());

  const matchupByTeam = new Map<
    string,
    { matchup: MatchupPreviewRecord; venue: "Home" | "Away"; opponent: string; opponentCanonicalTeam: string }
  >();

  for (const matchup of matchups) {
    matchupByTeam.set(matchup.homeCanonicalTeam, {
      matchup,
      venue: "Home",
      opponent: matchup.awayTeam,
      opponentCanonicalTeam: matchup.awayCanonicalTeam,
    });
    matchupByTeam.set(matchup.awayCanonicalTeam, {
      matchup,
      venue: "Away",
      opponent: matchup.homeTeam,
      opponentCanonicalTeam: matchup.homeCanonicalTeam,
    });
  }

  const analyticsPlayersByNameTeam = new Map<string, PlayerAnalyticsRecord>();
  for (const player of data.players) {
    const key = `${normalizeText(player.player)}::${canonicalizeTeamName(player.team)}`;
    if (!analyticsPlayersByNameTeam.has(key)) {
      analyticsPlayersByNameTeam.set(key, player);
    }
  }

  const playerBoard = officialFantasyPlayerPool
    .map((player) => {
      const canonicalTeam = canonicalizeTeamName(player.club_name);
      const matchupContext = matchupByTeam.get(canonicalTeam) ?? null;
      const analyticsPlayer =
        analyticsPlayersByNameTeam.get(`${normalizeText(player.display_name)}::${canonicalTeam}`) ??
        null;
      const currentWeight = analyticsPlayer
        ? clamp(analyticsPlayer.minutes90 / 8, 0.18, 0.72)
        : 0.22;
      const expectedMinutes = estimateExpectedMinutes(player, analyticsPlayer, currentWeight);
      const rates = buildPlayerRates(player, analyticsPlayer, currentWeight);
      const matchup = matchupContext?.matchup ?? null;
      const isHome = matchupContext?.venue === "Home" ? true : matchupContext?.venue === "Away" ? false : null;
      const teamLambda =
        matchup && isHome != null ? (isHome ? matchup.lambdaHome : matchup.lambdaAway) : leagueGoalsPer90;
      const opponentLambda =
        matchup && isHome != null ? (isHome ? matchup.lambdaAway : matchup.lambdaHome) : leagueGoalsPer90;
      const drawChance = matchup?.drawProb ?? 0;
      const attackMultiplier = matchup
        ? clamp(
            (teamLambda / Math.max(leagueGoalsPer90, 0.1)) *
              (1 + (rates.shotsPer90 / 4) * 0.04),
            0.72,
            1.4
          )
        : 1;
      const creationMultiplier = matchup
        ? clamp((matchup.totalGoals / Math.max(leagueGoalsPer90 * 2, 0.1)) * 0.94, 0.78, 1.28)
        : 1;
      const defensiveMultiplier = matchup
        ? clamp(
            (matchupContext?.opponentCanonicalTeam
              ? (teamContexts.get(matchupContext.opponentCanonicalTeam)?.team.shotsPer90 ?? leagueShotsPer90) /
                Math.max(leagueShotsPer90, 0.1)
              : 1) * 0.92,
            0.82,
            1.24
          )
        : 1;
      const cleanSheetChance =
        matchup && isHome != null
          ? isHome
            ? matchup.homeCleanSheetProb
            : matchup.awayCleanSheetProb
          : null;
      const winChance =
        matchup && isHome != null
          ? isHome
            ? matchup.homeWinProb
            : matchup.awayWinProb
          : null;
      const appearancePoints = expectedMinutes > 0 ? launchScoringRules.appearance : 0;
      const minutesBonus = launchScoringRules.minutes60Plus * clamp((expectedMinutes - 45) / 25, 0, 1);
      const minutesFactor = expectedMinutes / 90;
      const modeledProjection =
        appearancePoints +
        minutesBonus +
        rates.goalsPer90 * minutesFactor * attackMultiplier * launchScoringRules.goal[resolvePlayerPosition(player)] +
        rates.assistsPer90 * minutesFactor * attackMultiplier * launchScoringRules.assist +
        rates.shotsPer90 * minutesFactor * attackMultiplier * launchScoringRules.shot +
        rates.shotsOnTargetPer90 * minutesFactor * attackMultiplier * launchScoringRules.shotOnTarget +
        rates.chancesCreatedPer90 * minutesFactor * creationMultiplier * launchScoringRules.chanceCreated +
        rates.successfulPassesPer90 * minutesFactor * launchScoringRules.successfulPass +
        rates.successfulCrossesPer90 * minutesFactor * launchScoringRules.successfulCross +
        rates.tacklesWonPer90 * minutesFactor * defensiveMultiplier * launchScoringRules.tackleWon +
        rates.interceptionsPer90 * minutesFactor * defensiveMultiplier * launchScoringRules.interception +
        rates.blocksPer90 * minutesFactor * defensiveMultiplier * launchScoringRules.block +
        (player.position === "GK"
          ? rates.savesPer90 *
              minutesFactor *
              clamp(
                (matchupContext?.opponentCanonicalTeam
                  ? (teamContexts.get(matchupContext.opponentCanonicalTeam)?.team.shotsPer90 ?? leagueShotsPer90) /
                    Math.max(leagueShotsPer90, 0.1)
                  : 1) * 1.04,
                0.92,
                1.3
              ) *
              launchScoringRules.save
          : 0) +
        ((player.position === "GK" || player.position === "DEF") && cleanSheetChance != null
          ? cleanSheetChance * launchScoringRules.cleanSheet[player.position]
          : 0) +
        (player.position === "GK" && winChance != null
          ? winChance * launchScoringRules.goalkeeperWin +
            drawChance * launchScoringRules.goalkeeperDraw
          : 0) +
        ((player.position === "GK" || player.position === "DEF") && matchup != null
          ? Math.max(0, opponentLambda - 1.1) *
            launchScoringRules.goalsConceded[player.position] *
            0.32
          : 0);

      const baselineProjection = round(
        player.average_points *
          clamp(
            0.92 +
              ((winChance ?? 0.5) - 0.5) * (player.position === "GK" || player.position === "DEF" ? 0.36 : 0.18) +
              ((cleanSheetChance ?? 0.24) - 0.24) * (player.position === "GK" || player.position === "DEF" ? 0.7 : 0),
            0.74,
            1.28
          ),
        2
      );
      const historyWeight = clamp(0.64 - currentWeight * 0.45, 0.28, 0.64);
      const projection = round(
        clamp(baselineProjection * historyWeight + modeledProjection * (1 - historyWeight), 0, 40),
        2
      );
      const floor = round(
        clamp(
          appearancePoints +
            minutesBonus * 0.85 +
            rates.successfulPassesPer90 * minutesFactor * launchScoringRules.successfulPass * 0.72 +
            rates.tacklesWonPer90 * minutesFactor * launchScoringRules.tackleWon * 0.82 +
            rates.interceptionsPer90 * minutesFactor * launchScoringRules.interception * 0.82 +
            rates.blocksPer90 * minutesFactor * launchScoringRules.block * 0.75 +
            ((player.position === "GK" || player.position === "DEF") && cleanSheetChance != null
              ? cleanSheetChance * launchScoringRules.cleanSheet[player.position] * 0.55
              : 0),
          0,
          projection * 0.92
        ),
        2
      );
      const ceiling = round(
        Math.max(
          projection + 2,
          projection +
            rates.goalsPer90 * minutesFactor * attackMultiplier * launchScoringRules.goal[resolvePlayerPosition(player)] * 0.95 +
            rates.assistsPer90 * minutesFactor * attackMultiplier * launchScoringRules.assist * 0.8 +
            rates.shotsOnTargetPer90 * minutesFactor * attackMultiplier * launchScoringRules.shotOnTarget * 0.7 +
            ((player.position === "GK" || player.position === "DEF") && cleanSheetChance != null
              ? cleanSheetChance * launchScoringRules.cleanSheet[player.position] * 0.65
              : 0)
        ),
        2
      );
      const confidence = projectionConfidence(player, analyticsPlayer, expectedMinutes, currentWeight);
      const reasons = buildPlayerReasons(player, rates, projection, expectedMinutes, matchup, isHome);

      return {
        id: player.id,
        officialPlayerId: player.official_player_id,
        player: player.display_name,
        team: displayNames.get(canonicalTeam) ?? player.club_name,
        canonicalTeam,
        position: player.position,
        availability: player.availability,
        opponent: matchupContext?.opponent ?? null,
        opponentCanonicalTeam: matchupContext?.opponentCanonicalTeam ?? null,
        venue: matchupContext?.venue ?? null,
        matchDate: matchup?.matchDate ?? null,
        matchDateLabel: matchup?.matchDateLabel ?? null,
        salary: player.salary_cost,
        rank: player.rank,
        baselineProjection,
        projection,
        floor,
        ceiling,
        confidence,
        expectedMinutes,
        valueScore: round(projection / Math.max(player.salary_cost / 1000, 0.001), 2),
        shotVolume: round(rates.shotsPer90 * minutesFactor * attackMultiplier, 2),
        creationVolume: round(rates.chancesCreatedPer90 * minutesFactor * creationMultiplier, 2),
        defensiveVolume: round(
          (rates.tacklesWonPer90 + rates.interceptionsPer90 + rates.blocksPer90) *
            minutesFactor *
            defensiveMultiplier,
          2
        ),
        cleanSheetChance: cleanSheetChance != null ? round(cleanSheetChance, 4) : null,
        winChance: winChance != null ? round(winChance, 4) : null,
        matchupTag: matchupTagForPlayer(player.position, matchup, isHome),
        riskLabel: buildRiskLabel(player.availability, expectedMinutes, confidence, cleanSheetChance),
        trendLabel: buildTrendLabel(projection, baselineProjection, player.availability, confidence),
        reasons,
      } satisfies PlayerProjectionRecord;
    })
    .filter((player) => player.availability !== "out" && player.expectedMinutes >= 18 && player.matchDate)
    .sort((left, right) => {
      if (right.projection !== left.projection) return right.projection - left.projection;
      return right.ceiling - left.ceiling;
    });

  const topTargetsByTeam = new Map<string, PlayerProjectionRecord[]>();
  for (const player of playerBoard) {
    const list = topTargetsByTeam.get(player.canonicalTeam) ?? [];
    list.push(player);
    topTargetsByTeam.set(
      player.canonicalTeam,
      list.sort((left, right) => right.projection - left.projection).slice(0, 4)
    );
  }

  const enrichedMatchups: MatchupPreviewRecord[] = matchups.map((matchup) => ({
    ...matchup,
    homeTargets: topTargetsByTeam.get(matchup.homeCanonicalTeam) ?? [],
    awayTargets: topTargetsByTeam.get(matchup.awayCanonicalTeam) ?? [],
  }));

  const highestTotal = [...enrichedMatchups].sort((left, right) => right.totalGoals - left.totalGoals)[0];
  const strongestFavorite = [...enrichedMatchups].sort(
    (left, right) =>
      Math.max(right.homeWinProb, right.awayWinProb) - Math.max(left.homeWinProb, left.awayWinProb)
  )[0];
  const bestCleanSheet = [...enrichedMatchups].sort(
    (left, right) =>
      Math.max(right.homeCleanSheetProb, right.awayCleanSheetProb) -
      Math.max(left.homeCleanSheetProb, left.awayCleanSheetProb)
  )[0];
  const bestValue = [...playerBoard].sort((left, right) => right.valueScore - left.valueScore)[0];

  const matchupBoard: PredictiveSlateBoardRecord[] = [
    highestTotal
      ? {
          label: "Best total",
          value: `${highestTotal.homeTeam} vs ${highestTotal.awayTeam}`,
          detail: `${round(highestTotal.totalGoals, 1)} projected goals`,
        }
      : {
          label: "Best total",
          value: "No slate",
          detail: "No upcoming fixtures available",
        },
    strongestFavorite
      ? {
          label: "Strongest side",
          value:
            strongestFavorite.homeWinProb >= strongestFavorite.awayWinProb
              ? strongestFavorite.homeTeam
              : strongestFavorite.awayTeam,
          detail: `${formatPercent(
            Math.max(strongestFavorite.homeWinProb, strongestFavorite.awayWinProb)
          )} win probability`,
        }
      : {
          label: "Strongest side",
          value: "No slate",
          detail: "Waiting on fixtures",
        },
    bestCleanSheet
      ? {
          label: "Best clean sheet",
          value:
            bestCleanSheet.homeCleanSheetProb >= bestCleanSheet.awayCleanSheetProb
              ? bestCleanSheet.homeTeam
              : bestCleanSheet.awayTeam,
          detail: `${formatPercent(
            Math.max(bestCleanSheet.homeCleanSheetProb, bestCleanSheet.awayCleanSheetProb)
          )} clean-sheet probability`,
        }
      : {
          label: "Best clean sheet",
          value: "No slate",
          detail: "Waiting on fixtures",
        },
    bestValue
      ? {
          label: "Top value",
          value: bestValue.player,
          detail: `${bestValue.projection.toFixed(1)} pts at $${bestValue.salary}`,
        }
      : {
          label: "Top value",
          value: "No slate",
          detail: "Waiting on player projections",
        },
  ];

  const predictive = {
    generatedAt: new Date().toISOString(),
    slateTitle:
      enrichedMatchups.length > 0
        ? `${enrichedMatchups.length} upcoming NWSL matchups`
        : "No upcoming NWSL matchups",
    matchupBoard,
    matchups: enrichedMatchups,
    playerBoard,
    bestValues: [...playerBoard].sort((left, right) => right.valueScore - left.valueScore).slice(0, 12),
    bestCeilings: [...playerBoard].sort((left, right) => right.ceiling - left.ceiling).slice(0, 12),
    safestFloors: [...playerBoard].sort((left, right) => right.floor - left.floor).slice(0, 12),
    propTargets: [...playerBoard]
      .sort(
        (left, right) =>
          right.shotVolume +
          right.creationVolume +
          right.projection * 0.12 -
          (left.shotVolume + left.creationVolume + left.projection * 0.12)
      )
      .slice(0, 12),
  };

  return {
    ...data,
    predictive,
  } satisfies PredictiveHubData;
});
