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
  completedRegularSeasonCount: number;
  completedNonRegularSeasonCount: number;
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

const REGULAR_SEASON_MATCHES_PER_TEAM_BY_SEASON: Record<number, number> = {
  2025: 26,
  2026: 30,
};

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

function regularSeasonMatchCount(matches: EspnModelMatch[]): number {
  const teams = new Set<string>();
  for (const match of matches) {
    teams.add(match.homeTeam);
    teams.add(match.awayTeam);
  }

  const season = seasonFromDate(matches[0]?.date ?? "");
  const matchesPerTeam = REGULAR_SEASON_MATCHES_PER_TEAM_BY_SEASON[season];
  if (!matchesPerTeam || teams.size === 0) {
    return matches.length;
  }
  return Math.min(matches.length, (teams.size * matchesPerTeam) / 2);
}

function regularSeasonIdsBySeason(matches: EspnModelMatch[]): Set<string> {
  const ids = new Set<string>();
  const bySeason = new Map<number, EspnModelMatch[]>();
  for (const match of matches) {
    const season = seasonFromDate(match.date);
    bySeason.set(season, [...(bySeason.get(season) ?? []), match]);
  }

  for (const seasonMatches of bySeason.values()) {
    const sorted = [...seasonMatches].sort((left, right) => {
      const dateOrder = left.date.localeCompare(right.date);
      return dateOrder || left.matchId.localeCompare(right.matchId);
    });
    for (const match of sorted.slice(0, regularSeasonMatchCount(sorted))) {
      ids.add(match.matchId);
    }
  }
  return ids;
}

function rowForMatch(match: EspnModelMatch, regularSeasonIds: Set<string>): string {
  return [
    match.matchId,
    match.date,
    seasonFromDate(match.date),
    "NWSL",
    regularSeasonIds.has(match.matchId),
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
  const regularSeasonIds = regularSeasonIdsBySeason(allMatches);
  const completed = allMatches.filter((match) => match.status === "completed");
  const upcoming = allMatches.filter((match) => match.status !== "completed");
  const completedRegularSeason = completed.filter((match) => regularSeasonIds.has(match.matchId));

  return {
    matchesCsv: [MODEL_INPUT_HEADER.join(","), ...completed.map((match) => rowForMatch(match, regularSeasonIds))].join("\n") + "\n",
    upcomingCsv: [MODEL_INPUT_HEADER.join(","), ...upcoming.map((match) => rowForMatch(match, regularSeasonIds))].join("\n") + "\n",
    completedCount: completed.length,
    upcomingCount: upcoming.length,
    completedRegularSeasonCount: completedRegularSeason.length,
    completedNonRegularSeasonCount: completed.length - completedRegularSeason.length,
    seasonCoverage: seasonCoverage(allMatches),
    completedSeasonCoverage: seasonCoverage(completed),
    upcomingSeasonCoverage: seasonCoverage(upcoming),
    completedDateRange: dateRange(completed),
    upcomingDateRange: dateRange(upcoming),
  };
}
