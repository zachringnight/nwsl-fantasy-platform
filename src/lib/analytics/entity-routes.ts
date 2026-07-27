const ANALYTICS_ROOT = "/analytics";

function encodedSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

function withSeason(path: string, season?: "2025" | "2026"): string {
  return season ? `${path}?season=${season}` : path;
}

export function analyticsTeamId(teamName: string): string {
  return teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function analyticsTeamHref(
  teamId: string,
  season?: "2025" | "2026"
): string {
  return withSeason(
    `${ANALYTICS_ROOT}/teams/${encodedSegment(teamId)}`,
    season
  );
}

export function analyticsPlayerHref(
  playerId: string,
  season?: "2025" | "2026"
): string {
  return withSeason(
    `${ANALYTICS_ROOT}/players/${encodedSegment(playerId)}`,
    season
  );
}

export function fantasyPlayerHref(playerId: string): string {
  return `/players/${encodedSegment(playerId)}`;
}

export function analyticsMatchHref(
  matchId: string,
  season?: "2025" | "2026"
): string {
  return withSeason(
    `${ANALYTICS_ROOT}/matches/${encodedSegment(matchId)}`,
    season
  );
}

export function analyticsPredictionHref(
  matchId: string,
  season?: "2025" | "2026"
): string {
  return withSeason(
    `${ANALYTICS_ROOT}/predictions/${encodedSegment(matchId)}`,
    season
  );
}
