export interface EspnModelMatch {
  matchId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  status: string;
  venue: string;
}

export interface ModelInputCsvs {
  matchesCsv: string;
  upcomingCsv: string;
  completedCount: number;
  upcomingCount: number;
  seasonCoverage: number[];
  completedSeasonCoverage: number[];
  upcomingSeasonCoverage: number[];
  completedDateRange: [string, string] | null;
  upcomingDateRange: [string, string] | null;
}

const MODEL_INPUT_HEADER = [
  "match_id",
  "match_date",
  "season",
  "competition",
  "regular_season_flag",
  "home_team",
  "away_team",
  "home_goals_90",
  "away_goals_90",
  "venue",
  "match_status",
];

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function seasonFromDate(date: string): number {
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid NWSL match date: ${date}`);
  }
  return year;
}

function rowForMatch(match: EspnModelMatch): string {
  return [
    match.matchId,
    match.date,
    seasonFromDate(match.date),
    "NWSL",
    true,
    match.homeTeam,
    match.awayTeam,
    match.homeGoals,
    match.awayGoals,
    match.venue,
    match.status === "completed" ? "completed" : "scheduled",
  ]
    .map(csvCell)
    .join(",");
}

function dateRange(matches: EspnModelMatch[]): [string, string] | null {
  if (matches.length === 0) {
    return null;
  }
  return [matches[0].date, matches[matches.length - 1].date];
}

function seasonCoverage(matches: EspnModelMatch[]): number[] {
  return Array.from(new Set(matches.map((match) => seasonFromDate(match.date)))).sort();
}

export function buildModelInputCsvs(
  matches2025: EspnModelMatch[],
  matches2026: EspnModelMatch[]
): ModelInputCsvs {
  const allMatches = [...matches2025, ...matches2026].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    return dateOrder || left.matchId.localeCompare(right.matchId);
  });
  const completed = allMatches.filter((match) => match.status === "completed");
  const upcoming = allMatches.filter((match) => match.status !== "completed");

  return {
    matchesCsv: [MODEL_INPUT_HEADER.join(","), ...completed.map(rowForMatch)].join("\n") + "\n",
    upcomingCsv: [MODEL_INPUT_HEADER.join(","), ...upcoming.map(rowForMatch)].join("\n") + "\n",
    completedCount: completed.length,
    upcomingCount: upcoming.length,
    seasonCoverage: seasonCoverage(allMatches),
    completedSeasonCoverage: seasonCoverage(completed),
    upcomingSeasonCoverage: seasonCoverage(upcoming),
    completedDateRange: dateRange(completed),
    upcomingDateRange: dateRange(upcoming),
  };
}
