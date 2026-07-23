/**
 * Real NWSL data adapter.
 *
 * Player stats: 410 official NWSL players with 2025 season stats.
 * Team standings: Real ESPN standings for 2025 and 2026 seasons.
 * Match results: Real ESPN match data.
 * Form: Derived from actual match results.
 */

import {
  officialFantasyPlayerPool,
  type OfficialFantasyPoolPlayerRecord,
} from "@/lib/generated/fantasy-player-pool.generated";
import type {
  FormResult,
  MatchResult,
  PlayerSeasonStats,
  TeamStanding,
  TeamStats,
  TeamRating,
} from "@/types/analytics";
import {
  getEspnStandings2026,
  getEspnStandings2025,
  getAllEspnMatches,
  getEspnMatchesBySeason,
  getEspnStandingsBySeason,
  type EspnMatch,
  type EspnStanding,
} from "./espn-data-loader";

export type Season = "2025" | "2026";

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Player Data (real 2025 stats) ───────────────────────────────────────────

export function getRealPlayerRankings(): PlayerSeasonStats[] {
  return officialFantasyPlayerPool
    .map((p) => toPlayerSeasonStats(p))
    .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
}

export function getRealPlayerById(playerId: string): PlayerSeasonStats | undefined {
  const p = officialFantasyPlayerPool.find((x) => x.id === playerId);
  if (!p) return undefined;
  return toPlayerSeasonStats(p);
}

function toPlayerSeasonStats(p: OfficialFantasyPoolPlayerRecord): PlayerSeasonStats {
  const minutes = p.minutes_2025;
  const nineties = minutes / 90;
  const fp = p.raw_average_points_2025 * p.appearances_2025;
  const totalPassAttempts = p.successful_passes_2025 + p.fouls_committed_2025 * 3; // rough estimate

  return {
    playerId: p.id,
    name: p.display_name,
    team: p.club_name,
    teamId: slugify(p.club_name),
    position: p.position,
    appearances: p.appearances_2025,
    minutes: p.minutes_2025,
    goals: p.goals_2025,
    assists: p.assists_2025,
    xg: 0, // not available without API-Football — shown as N/A in UI
    xa: 0,
    shots: p.shots_2025,
    shotsOnTarget: p.shots_on_target_2025,
    passAccuracy: totalPassAttempts > 0
      ? Math.min(99, Math.round((p.successful_passes_2025 / totalPassAttempts) * 100))
      : 0,
    tackles: p.tackles_won_2025,
    interceptions: p.interceptions_2025,
    cleanSheets: p.clean_sheets_2025,
    saves: p.saves_2025,
    yellowCards: p.yellow_cards_2025,
    redCards: p.red_cards_2025,
    fantasyPoints: Math.round(fp * 10) / 10,
    pointsPer90: nineties > 0 ? Math.round((fp / nineties) * 10) / 10 : 0,
  };
}

// ── Team Standings (real ESPN data) ─────────────────────────────────────────

function deriveFormFromMatches(teamName: string, matches: EspnMatch[]): FormResult[] {
  const teamMatches = matches
    .filter((m) => m.status === "completed" && (m.homeTeam === teamName || m.awayTeam === teamName))
    .sort((a, b) => b.date.localeCompare(a.date)); // most recent first

  return teamMatches.slice(0, 5).map((m) => {
    const isHome = m.homeTeam === teamName;
    const scored = isHome ? m.homeGoals : m.awayGoals;
    const conceded = isHome ? m.awayGoals : m.homeGoals;
    if (scored > conceded) return "W";
    if (scored < conceded) return "L";
    return "D";
  });
}

function espnStandingsToTeamStandings(
  espnStandings: EspnStanding[],
  matches: EspnMatch[]
): TeamStanding[] {
  return espnStandings.map((s) => ({
    teamId: slugify(s.team),
    team: s.team,
    played: s.played,
    won: s.won,
    drawn: s.drawn,
    lost: s.lost,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    goalDifference: s.goalDifference,
    points: s.points,
    form: deriveFormFromMatches(s.team, matches),
    xg: 0, // not available from ESPN
    xga: 0,
  }));
}

export function getRealStandings(): TeamStanding[] {
  // Use 2026 standings if available (current season), fallback to 2025
  const espn2026 = getEspnStandings2026();
  const allMatches = getAllEspnMatches();

  if (espn2026.length > 0) {
    return espnStandingsToTeamStandings(espn2026, allMatches);
  }

  return espnStandingsToTeamStandings(getEspnStandings2025(), allMatches);
}

// ── Team Stats (aggregated from real player data) ───────────────────────────

export function getRealTeamStats(): TeamStats[] {
  const teams = new Map<string, {
    teamId: string;
    team: string;
    shots: number;
    shotsOnTarget: number;
    tackles: number;
    interceptions: number;
    passes: number;
  }>();

  for (const p of officialFantasyPlayerPool) {
    const teamId = slugify(p.club_name);
    let t = teams.get(teamId);
    if (!t) {
      t = { teamId, team: p.club_name, shots: 0, shotsOnTarget: 0, tackles: 0, interceptions: 0, passes: 0 };
      teams.set(teamId, t);
    }
    t.shots += p.shots_2025;
    t.shotsOnTarget += p.shots_on_target_2025;
    t.tackles += p.tackles_won_2025;
    t.interceptions += p.interceptions_2025;
    t.passes += p.successful_passes_2025;
  }

  // Get GK clean sheets per team
  const standings = getRealStandings();

  return [...teams.values()].map((t) => {
    const standing = standings.find((s) => s.teamId === t.teamId);
    const gks = officialFantasyPlayerPool.filter(
      (p) => slugify(p.club_name) === t.teamId && p.position === "GK"
    );
    const cleanSheets = Math.max(0, ...gks.map((gk) => gk.clean_sheets_2025));

    return {
      teamId: t.teamId,
      team: t.team,
      xg: 0, // not available
      xga: 0,
      npxg: 0,
      possession: 0, // not available
      shots: t.shots,
      shotsOnTarget: t.shotsOnTarget,
      passAccuracy: 0, // need total attempts which we don't have
      tackles: t.tackles,
      interceptions: t.interceptions,
      cleanSheets,
      corners: 0, // not available
    };
  });
}

// ── Team Ratings (derived from real standings) ──────────────────────────────

export function getRealTeamRatings(): TeamRating[] {
  const standings = getRealStandings();

  const ratings: TeamRating[] = standings.map((s, i) => {
    const ppg = s.played > 0 ? s.points / s.played : 0;
    const gfPg = s.played > 0 ? s.goalsFor / s.played : 0;
    const gaPg = s.played > 0 ? s.goalsAgainst / s.played : 0;

    // Attack: based on goals per game (league avg ~1.3 GPG)
    const attackScore = Math.min(95, Math.max(30, gfPg * 35 + 20));
    // Defense: based on goals conceded per game (lower is better)
    const defenseScore = Math.min(95, Math.max(30, 90 - gaPg * 30));
    const overall = (attackScore + defenseScore) / 2;

    // Trend from recent form
    const form = s.form;
    const recentWins = form.slice(0, 3).filter((f) => f === "W").length;
    const recentLosses = form.slice(0, 3).filter((f) => f === "L").length;

    return {
      teamId: s.teamId,
      team: s.team,
      overallRating: Math.round(overall * 10) / 10,
      attackRating: Math.round(attackScore * 10) / 10,
      defenseRating: Math.round(defenseScore * 10) / 10,
      homeAdvantage: 0.25, // league average — would need home/away splits for real value
      trend: recentWins >= 2 ? "up" : recentLosses >= 2 ? "down" : "stable",
      previousRank: i + 1,
      currentRank: i + 1,
    };
  });

  return ratings.sort((a, b) => b.overallRating - a.overallRating).map((r, i) => ({
    ...r,
    currentRank: i + 1,
  }));
}

// ── Match Results (real ESPN data) ──────────────────────────────────────────

function buildMatchdayByDate(matches: EspnMatch[]): Map<string, number> {
  const seasons = [...new Set(matches.map((match) => match.date.slice(0, 4)))];
  const dateToMatchday = new Map<string, number>();

  for (const season of seasons) {
    const dates = [
      ...new Set(
        matches
          .filter((match) => match.date.startsWith(season))
          .map((match) => match.date)
      ),
    ].sort();
    dates.forEach((date, index) => dateToMatchday.set(date, index + 1));
  }

  return dateToMatchday;
}

export function getRealMatchResults(): MatchResult[] {
  const allMatches = getAllEspnMatches();
  const dateToMatchday = buildMatchdayByDate(allMatches);

  return allMatches.map((m) => ({
    matchId: m.matchId,
    date: m.date,
    matchday: dateToMatchday.get(m.date) ?? 1,
    homeTeam: m.homeTeam,
    homeTeamId: slugify(m.homeTeam),
    awayTeam: m.awayTeam,
    awayTeamId: slugify(m.awayTeam),
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    homeXg: 0, // not available from ESPN
    awayXg: 0,
    venue: m.venue,
    status: m.status,
  }));
}

// ── Team Detail ─────────────────────────────────────────────────────────────

export function getRealTeamById(teamId: string) {
  const standings = getRealStandings();
  const stats = getRealTeamStats();
  const ratings = getRealTeamRatings();
  const allMatches = getRealMatchResults();

  const standing = standings.find((s) => s.teamId === teamId);
  const stat = stats.find((s) => s.teamId === teamId);
  const rating = ratings.find((r) => r.teamId === teamId);
  const players = getRealPlayerRankings().filter((p) => p.teamId === teamId);
  const matches = allMatches.filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId
  );

  return { standing, stats: stat, rating, matches, players };
}

// ── Season-aware accessors ──────────────────────────────────────────────────

export function getStandingsBySeason(season: Season): TeamStanding[] {
  const espn = getEspnStandingsBySeason(season);
  const matches = getEspnMatchesBySeason(season);
  return espnStandingsToTeamStandings(espn, matches);
}

export function getMatchResultsBySeason(season: Season): MatchResult[] {
  const matches = getEspnMatchesBySeason(season);
  const dateToMatchday = buildMatchdayByDate(matches);

  return matches.map((m) => ({
    matchId: m.matchId,
    date: m.date,
    matchday: dateToMatchday.get(m.date) ?? 1,
    homeTeam: m.homeTeam,
    homeTeamId: slugify(m.homeTeam),
    awayTeam: m.awayTeam,
    awayTeamId: slugify(m.awayTeam),
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    homeXg: 0,
    awayXg: 0,
    venue: m.venue,
    status: m.status,
  }));
}

// ── Metadata ────────────────────────────────────────────────────────────────

export function getRealTeamNames(): string[] {
  return [...new Set(officialFantasyPlayerPool.map((p) => p.club_name))].sort();
}

export function getRealPlayerCount(): number {
  return officialFantasyPlayerPool.length;
}
