/**
 * Realistic mock data for the NWSL analytics section.
 * Uses real 2026 NWSL team names and generates plausible stats.
 * This data powers the UI until API-Football / model outputs are connected.
 */

import type {
  FormResult,
  MatchDetail,
  MatchPrediction,
  MatchResult,
  ModelPerformance,
  PlayerFormPoint,
  PlayerMatchLog,
  PlayerSeasonStats,
  TeamRating,
  TeamStanding,
  TeamStats,
} from "@/types/analytics";
import type { PlayerPosition } from "@/types/fantasy";

// ── Helpers ─────────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => Math.round((rand() * (hi - lo) + lo) * 100) / 100;
const intBetween = (lo: number, hi: number) => Math.floor(rand() * (hi - lo + 1)) + lo;

// ── Teams ──────────���────────────────────────────────────────────────────────

const TEAMS = [
  { id: "angel-city-fc", name: "Angel City FC" },
  { id: "bay-fc", name: "Bay FC" },
  { id: "chicago-red-stars", name: "Chicago Red Stars" },
  { id: "houston-dash", name: "Houston Dash" },
  { id: "kansas-city-current", name: "Kansas City Current" },
  { id: "nj-ny-gotham-fc", name: "NJ/NY Gotham FC" },
  { id: "north-carolina-courage", name: "North Carolina Courage" },
  { id: "orlando-pride", name: "Orlando Pride" },
  { id: "portland-thorns-fc", name: "Portland Thorns FC" },
  { id: "racing-louisville-fc", name: "Racing Louisville FC" },
  { id: "san-diego-wave-fc", name: "San Diego Wave FC" },
  { id: "seattle-reign-fc", name: "Seattle Reign FC" },
  { id: "utah-royals-fc", name: "Utah Royals FC" },
  { id: "washington-spirit", name: "Washington Spirit" },
] as const;

const VENUES = [
  "BMO Stadium", "PayPal Park", "SeatGeek Stadium", "Shell Energy Stadium",
  "CPKC Stadium", "Red Bull Arena", "WakeMed Soccer Park", "Inter&Co Stadium",
  "Providence Park", "Lynn Family Stadium", "Snapdragon Stadium", "Lumen Field",
  "America First Field", "Audi Field",
];

// ── Standings ───────────���───────────────────────────────────────────────────

function generateForm(): FormResult[] {
  return Array.from({ length: 5 }, () => pick(["W", "D", "L"] as FormResult[]));
}

function generateStandings(): TeamStanding[] {
  const standings: TeamStanding[] = TEAMS.map((t) => {
    const played = intBetween(8, 10);
    const won = intBetween(2, 7);
    const drawn = intBetween(0, Math.min(3, played - won));
    const lost = played - won - drawn;
    const gf = won * intBetween(1, 3) + drawn + intBetween(0, 3);
    const ga = lost * intBetween(1, 2) + drawn + intBetween(0, 2);
    return {
      teamId: t.id,
      team: t.name,
      played,
      won,
      drawn,
      lost,
      goalsFor: gf,
      goalsAgainst: ga,
      goalDifference: gf - ga,
      points: won * 3 + drawn,
      form: generateForm(),
      xg: between(gf * 0.85, gf * 1.15),
      xga: between(ga * 0.85, ga * 1.15),
    };
  });

  return standings.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
}

// ── Team Stats ──────────────────────────────────────────────────────────────

function generateTeamStats(): TeamStats[] {
  return TEAMS.map((t) => ({
    teamId: t.id,
    team: t.name,
    xg: between(10, 22),
    xga: between(8, 20),
    npxg: between(8, 19),
    possession: between(42, 58),
    shots: between(90, 160),
    shotsOnTarget: between(35, 70),
    passAccuracy: between(76, 89),
    tackles: between(120, 200),
    interceptions: between(60, 120),
    cleanSheets: intBetween(1, 5),
    corners: between(40, 70),
  }));
}

// ── Team Ratings ────────────────────────────────────────────────────────────

function generateTeamRatings(): TeamRating[] {
  const ratings = TEAMS.map((t, i) => ({
    teamId: t.id,
    team: t.name,
    overallRating: between(60, 95),
    attackRating: between(55, 95),
    defenseRating: between(55, 95),
    homeAdvantage: between(0.15, 0.4),
    trend: pick(["up", "down", "stable"] as const),
    previousRank: intBetween(1, 14),
    currentRank: i + 1,
  }));
  return ratings.sort((a, b) => b.overallRating - a.overallRating).map((r, i) => ({
    ...r,
    currentRank: i + 1,
  }));
}

// ── Players ──────────────────────────────���──────────────────────────────────

const FIRST_NAMES = [
  "Sophia", "Trinity", "Naomi", "Lynn", "Megan", "Ashley", "Crystal", "Mallory",
  "Adrianna", "Jaelin", "Savannah", "Alyssa", "Emily", "Kelley", "Sam", "Morgan",
  "Alex", "Lindsey", "Rose", "Catarina", "Julie", "Becky", "Abby", "Christen",
  "Tobin", "Ali", "Carli", "Hope", "Mallory", "Tierna", "Casey", "Andi",
  "Mia", "Brandi", "Shannon", "Kristie", "Jessica", "Adriana", "Aubrey", "Taylor",
];

const LAST_NAMES = [
  "Smith", "Rodriguez", "Williams", "Thompson", "DeLuca", "Howell", "Dunn",
  "Pugh", "Franch", "Girma", "McCaskill", "Naeher", "Sonnett", "Horan",
  "Lavelle", "Macario", "Ertz", "Sauerbrunn", "Dahlkemper", "Press",
  "Heath", "Krieger", "Lloyd", "Solo", "Swanson", "Davidson", "Murphy",
  "Kingsbury", "Cook", "Fishel", "Sanchez", "Park", "Tanaka", "Johansson",
  "Martinez", "Anderson", "Wilson", "Garcia", "Thomas", "Robinson",
];

const POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

function generatePlayers(): PlayerSeasonStats[] {
  const players: PlayerSeasonStats[] = [];
  let id = 1;

  for (const team of TEAMS) {
    // 2 GK, 5 DEF, 5 MID, 4 FWD per team
    const squad = [
      ...Array.from({ length: 2 }, () => "GK" as PlayerPosition),
      ...Array.from({ length: 5 }, () => "DEF" as PlayerPosition),
      ...Array.from({ length: 5 }, () => "MID" as PlayerPosition),
      ...Array.from({ length: 4 }, () => "FWD" as PlayerPosition),
    ];

    for (const pos of squad) {
      const appearances = intBetween(3, 10);
      const minutes = appearances * intBetween(50, 90);
      const isAttacker = pos === "FWD" || pos === "MID";
      const isGK = pos === "GK";
      const goals = isGK ? 0 : isAttacker ? intBetween(0, 7) : intBetween(0, 2);
      const assists = isGK ? intBetween(0, 1) : intBetween(0, 5);
      const shots = isGK ? 0 : isAttacker ? intBetween(8, 40) : intBetween(2, 15);
      const saves = isGK ? intBetween(15, 45) : 0;
      const cleanSheets = isGK || pos === "DEF" ? intBetween(0, 4) : 0;
      const fantasyPoints = between(
        appearances * 3 + goals * 8 + assists * 5 + cleanSheets * 4,
        appearances * 6 + goals * 10 + assists * 6 + cleanSheets * 6 + saves * 1.5
      );

      players.push({
        playerId: `p-${id++}`,
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        team: team.name,
        teamId: team.id,
        position: pos,
        appearances,
        minutes,
        goals,
        assists,
        xg: between(goals * 0.7, goals * 1.3 + 0.5),
        xa: between(assists * 0.6, assists * 1.3 + 0.3),
        shots,
        shotsOnTarget: Math.round(shots * between(0.3, 0.55)),
        passAccuracy: between(68, 93),
        tackles: intBetween(5, 40),
        interceptions: intBetween(3, 30),
        cleanSheets,
        saves,
        yellowCards: intBetween(0, 4),
        redCards: intBetween(0, 1) > 0.9 ? 1 : 0,
        fantasyPoints: Math.round(fantasyPoints * 10) / 10,
        pointsPer90: Math.round((fantasyPoints / (minutes / 90)) * 10) / 10,
      });
    }
  }

  return players.sort((a, b) => b.fantasyPoints - a.fantasyPoints);
}

// ── Matches ────────────────────────────────────��────────────────────────────

function generateMatches(): MatchResult[] {
  const matches: MatchResult[] = [];
  let matchId = 1;
  const shuffled = [...TEAMS].sort(() => rand() - 0.5);

  // 9 completed matchdays, 1 upcoming
  for (let md = 1; md <= 10; md++) {
    const status = md <= 9 ? "completed" : "upcoming";
    // 7 matches per matchday (14 teams)
    for (let i = 0; i < 14; i += 2) {
      const hi = (i + md) % 14;
      const ai = (i + md + 1) % 14;
      const homeGoals = status === "completed" ? intBetween(0, 4) : 0;
      const awayGoals = status === "completed" ? intBetween(0, 3) : 0;
      matches.push({
        matchId: `m-${matchId++}`,
        date: `2026-04-${String(md + 5).padStart(2, "0")}`,
        matchday: md,
        homeTeam: shuffled[hi].name,
        homeTeamId: shuffled[hi].id,
        awayTeam: shuffled[ai].name,
        awayTeamId: shuffled[ai].id,
        homeGoals,
        awayGoals,
        homeXg: status === "completed" ? between(homeGoals * 0.7, homeGoals * 1.4 + 0.3) : 0,
        awayXg: status === "completed" ? between(awayGoals * 0.7, awayGoals * 1.4 + 0.3) : 0,
        venue: VENUES[hi % VENUES.length],
        status: status as "completed" | "upcoming",
      });
    }
  }

  return matches;
}

function generateMatchDetail(match: MatchResult): MatchDetail {
  const events: MatchDetail["events"] = [];
  for (let g = 0; g < match.homeGoals; g++) {
    events.push({
      minute: intBetween(1, 90),
      type: "goal",
      team: match.homeTeam,
      playerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    });
  }
  for (let g = 0; g < match.awayGoals; g++) {
    events.push({
      minute: intBetween(1, 90),
      type: "goal",
      team: match.awayTeam,
      playerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    });
  }
  events.sort((a, b) => a.minute - b.minute);

  return {
    ...match,
    homeShots: intBetween(6, 20),
    awayShots: intBetween(4, 18),
    homeShotsOnTarget: intBetween(2, 8),
    awayShotsOnTarget: intBetween(1, 7),
    homePossession: between(40, 60),
    awayPossession: 0, // filled below
    homeCorners: intBetween(2, 10),
    awayCorners: intBetween(1, 8),
    homeFouls: intBetween(6, 16),
    awayFouls: intBetween(5, 15),
    events,
  };
}

// ── Predictions ────────────────────────────���────────────────────────────────

function generatePredictions(matches: MatchResult[]): MatchPrediction[] {
  return matches
    .filter((m) => m.status === "upcoming")
    .map((m) => {
      const homeStr = between(0.3, 0.55);
      const drawStr = between(0.15, 0.3);
      const awayStr = 1 - homeStr - drawStr;
      const lambdaHome = between(1.0, 2.2);
      const lambdaAway = between(0.7, 1.8);

      // Generate realistic 9x9 score matrix
      const matrix: number[][] = [];
      let total = 0;
      for (let i = 0; i < 9; i++) {
        matrix[i] = [];
        for (let j = 0; j < 9; j++) {
          const poissonH = Math.exp(-lambdaHome) * Math.pow(lambdaHome, i) / factorial(i);
          const poissonA = Math.exp(-lambdaAway) * Math.pow(lambdaAway, j) / factorial(j);
          matrix[i][j] = poissonH * poissonA;
          total += matrix[i][j];
        }
      }
      // Normalize
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
          matrix[i][j] = Math.round((matrix[i][j] / total) * 10000) / 10000;
        }
      }

      return {
        matchId: m.matchId,
        date: m.date,
        homeTeam: m.homeTeam,
        homeTeamId: m.homeTeamId,
        awayTeam: m.awayTeam,
        awayTeamId: m.awayTeamId,
        homeProb: Math.round(homeStr * 1000) / 1000,
        drawProb: Math.round(drawStr * 1000) / 1000,
        awayProb: Math.round(awayStr * 1000) / 1000,
        bttsYesProb: between(0.35, 0.65),
        overUnder: {
          "1.5": { over: between(0.6, 0.85), under: between(0.15, 0.4) },
          "2.5": { over: between(0.35, 0.6), under: between(0.4, 0.65) },
          "3.5": { over: between(0.15, 0.35), under: between(0.65, 0.85) },
          "4.5": { over: between(0.05, 0.15), under: between(0.85, 0.95) },
        },
        asianHandicap: {
          "-0.5": { home: between(0.4, 0.55), away: between(0.45, 0.6) },
          "-1.0": { home: between(0.25, 0.4), away: between(0.6, 0.75) },
          "0.5": { home: between(0.55, 0.7), away: between(0.3, 0.45) },
          "1.0": { home: between(0.65, 0.8), away: between(0.2, 0.35) },
        },
        lambdaHome,
        lambdaAway,
        scoreMatrix: matrix,
        model: "dixon_coles",
        timestamp: "2026-04-03T12:00:00Z",
      };
    });
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// ── Player Match Log ────────────────────────────────────────────────────────

function generatePlayerMatchLog(playerId: string): PlayerMatchLog[] {
  const numMatches = intBetween(5, 10);
  return Array.from({ length: numMatches }, (_, i) => ({
    matchId: `m-${i + 1}`,
    date: `2026-04-${String(i + 6).padStart(2, "0")}`,
    opponent: pick(TEAMS).name,
    home: rand() > 0.5,
    minutes: intBetween(45, 90),
    goals: intBetween(0, 2),
    assists: intBetween(0, 2),
    shots: intBetween(0, 6),
    shotsOnTarget: intBetween(0, 3),
    passes: intBetween(20, 70),
    passAccuracy: between(65, 95),
    tackles: intBetween(0, 6),
    interceptions: intBetween(0, 4),
    saves: 0,
    fantasyPoints: between(2, 18),
  }));
}

function generatePlayerForm(playerId: string): PlayerFormPoint[] {
  const numMatches = intBetween(5, 10);
  return Array.from({ length: numMatches }, (_, i) => ({
    matchday: i + 1,
    date: `2026-04-${String(i + 6).padStart(2, "0")}`,
    fantasyPoints: between(2, 20),
    opponent: pick(TEAMS).name,
  }));
}

// ── Model Performance ─────────────��─────────────────────────────────────────

function generateModelPerformance(): ModelPerformance {
  return {
    model: "dixon_coles",
    logLoss: between(0.88, 1.05),
    brierScore: between(0.18, 0.24),
    calibrationError: between(0.02, 0.06),
    roi: between(-0.03, 0.08),
    hitRate: between(0.42, 0.56),
    totalPredictions: 156,
    calibrationBuckets: Array.from({ length: 10 }, (_, i) => {
      const predicted = (i + 0.5) / 10;
      return {
        predicted,
        actual: between(predicted * 0.8, predicted * 1.2),
        count: intBetween(8, 25),
      };
    }),
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────

const _standings = generateStandings();
const _teamStats = generateTeamStats();
const _teamRatings = generateTeamRatings();
const _players = generatePlayers();
const _matches = generateMatches();
const _predictions = generatePredictions(_matches);
const _modelPerformance = generateModelPerformance();

export function getMockStandings(): TeamStanding[] {
  return _standings;
}

export function getMockTeamStats(): TeamStats[] {
  return _teamStats;
}

export function getMockTeamRatings(): TeamRating[] {
  return _teamRatings;
}

export function getMockPlayers(): PlayerSeasonStats[] {
  return _players;
}

export function getMockPlayerById(playerId: string): PlayerSeasonStats | undefined {
  return _players.find((p) => p.playerId === playerId);
}

export function getMockPlayerMatchLog(playerId: string): PlayerMatchLog[] {
  return generatePlayerMatchLog(playerId);
}

export function getMockPlayerForm(playerId: string): PlayerFormPoint[] {
  return generatePlayerForm(playerId);
}

export function getMockMatches(): MatchResult[] {
  return _matches;
}

export function getMockMatchDetail(matchId: string): MatchDetail | undefined {
  const match = _matches.find((m) => m.matchId === matchId);
  if (!match) return undefined;
  const detail = generateMatchDetail(match);
  detail.awayPossession = Math.round((100 - detail.homePossession) * 100) / 100;
  return detail;
}

export function getMockPredictions(): MatchPrediction[] {
  return _predictions;
}

export function getMockPredictionById(matchId: string): MatchPrediction | undefined {
  return _predictions.find((p) => p.matchId === matchId);
}

export function getMockModelPerformance(): ModelPerformance {
  return _modelPerformance;
}

export function getMockTeamById(teamId: string) {
  const standing = _standings.find((s) => s.teamId === teamId);
  const stats = _teamStats.find((s) => s.teamId === teamId);
  const rating = _teamRatings.find((r) => r.teamId === teamId);
  const teamMatches = _matches.filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId
  );
  const teamPlayers = _players.filter((p) => p.teamId === teamId);

  return { standing, stats, rating, matches: teamMatches, players: teamPlayers };
}

export { TEAMS as MOCK_TEAMS };
