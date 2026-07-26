const ANALYTICS_ROOT = "/analytics";

function encodedSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

export function analyticsTeamId(teamName: string): string {
  return teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function analyticsTeamHref(teamId: string): string {
  return `${ANALYTICS_ROOT}/teams/${encodedSegment(teamId)}`;
}

export function analyticsPlayerHref(playerId: string): string {
  return `${ANALYTICS_ROOT}/players/${encodedSegment(playerId)}`;
}

export function fantasyPlayerHref(playerId: string): string {
  return `/players/${encodedSegment(playerId)}`;
}

export function analyticsMatchHref(matchId: string): string {
  return `${ANALYTICS_ROOT}/matches/${encodedSegment(matchId)}`;
}

export function analyticsPredictionHref(matchId: string): string {
  return `${ANALYTICS_ROOT}/predictions/${encodedSegment(matchId)}`;
}
