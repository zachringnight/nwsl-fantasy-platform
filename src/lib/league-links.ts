export function buildLeagueLinks(leagueId: string) {
  return {
    home: `/leagues/${leagueId}`,
    draft: `/leagues/${leagueId}/draft`,
    draftRoom: `/leagues/${leagueId}/draft/room`,
    draftRecap: `/leagues/${leagueId}/draft/recap`,
    team: `/leagues/${leagueId}/team`,
    players: `/leagues/${leagueId}/players`,
    matchup: `/leagues/${leagueId}/matchup`,
    standings: `/leagues/${leagueId}/standings`,
    transactions: `/leagues/${leagueId}/transactions`,
    settings: `/leagues/${leagueId}/settings`,
    chat: `/leagues/${leagueId}/chat`,
    achievements: `/leagues/${leagueId}/achievements`,
    trades: `/leagues/${leagueId}/trades`,
  };
}
