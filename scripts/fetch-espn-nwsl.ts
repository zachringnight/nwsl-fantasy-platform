#!/usr/bin/env npx tsx
/**
 * Fetch real NWSL data from ESPN's public API and write JSON files
 * for the analytics layer to consume.
 *
 * Usage: npx tsx scripts/fetch-espn-nwsl.ts
 *
 * Outputs:
 *   src/data/espn/standings-2025.json
 *   src/data/espn/standings-2026.json
 *   src/data/espn/matches-2025.json
 *   src/data/espn/matches-2026.json
 *   src/data/espn/teams.json
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "src", "data", "espn");
const BASE = "https://site.api.espn.com/apis";
const LEAGUE = "soccer/usa.nwsl";

mkdirSync(OUT_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  console.log(`  Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

function write(filename: string, data: unknown) {
  const path = join(OUT_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`  Wrote ${path}`);
}

// ── ESPN types (partial) ───────────────────────────────────────────────────

interface EspnStandingsResponse {
  children?: Array<{
    standings?: {
      entries?: Array<{
        team: { displayName: string; abbreviation: string; id: string };
        stats: Array<{ name: string; value: number }>;
      }>;
    };
  }>;
}

interface EspnScoreboardResponse {
  events?: Array<{
    id: string;
    date: string;
    name: string;
    status: { type: { name: string; description: string; completed: boolean } };
    competitions: Array<{
      venue?: { fullName: string };
      competitors: Array<{
        homeAway: string;
        score: string;
        team: { displayName: string; abbreviation: string; id: string };
      }>;
    }>;
  }>;
}

interface EspnTeamsResponse {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{
        team: {
          id: string;
          displayName: string;
          abbreviation: string;
          logos?: Array<{ href: string }>;
          color?: string;
        };
      }>;
    }>;
  }>;
}

// ── Standings ──────────────────────────────────────────────────────────────

interface Standing {
  rank: number;
  teamId: string;
  team: string;
  abbreviation: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

async function fetchStandings(season: number): Promise<Standing[]> {
  const url = `${BASE}/v2/sports/${LEAGUE}/standings?season=${season}`;
  const data = await fetchJson<EspnStandingsResponse>(url);

  const entries = data.children?.[0]?.standings?.entries ?? [];
  const standings: Standing[] = entries.map((entry, idx) => {
    const stat = (name: string) =>
      entry.stats.find((s) => s.name === name)?.value ?? 0;

    return {
      rank: idx + 1,
      teamId: entry.team.id,
      team: entry.team.displayName,
      abbreviation: entry.team.abbreviation,
      played: stat("gamesPlayed"),
      won: stat("wins"),
      drawn: stat("ties"),
      lost: stat("losses"),
      goalsFor: stat("pointsFor"),
      goalsAgainst: stat("pointsAgainst"),
      goalDifference: stat("pointDifferential"),
      points: stat("points"),
    };
  });

  // Sort by points desc, then GD
  standings.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
  standings.forEach((s, i) => (s.rank = i + 1));

  return standings;
}

// ── Matches ────────────────────────────────────────────────────────────────

interface Match {
  matchId: string;
  date: string;
  homeTeam: string;
  homeTeamId: string;
  awayTeam: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  status: "completed" | "upcoming" | "live";
  venue: string;
}

async function fetchMatches(
  dateFrom: string,
  dateTo: string
): Promise<Match[]> {
  const url = `${BASE}/site/v2/sports/${LEAGUE}/scoreboard?dates=${dateFrom}-${dateTo}&limit=200`;
  const data = await fetchJson<EspnScoreboardResponse>(url);

  const matches: Match[] = [];
  for (const event of data.events ?? []) {
    const comp = event.competitions[0];
    if (!comp) continue;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const statusName = event.status.type.name;
    let status: Match["status"] = "upcoming";
    if (event.status.type.completed) status = "completed";
    else if (["STATUS_IN_PROGRESS", "STATUS_HALFTIME"].includes(statusName))
      status = "live";

    matches.push({
      matchId: event.id,
      date: event.date.split("T")[0],
      homeTeam: home.team.displayName,
      homeTeamId: home.team.id,
      awayTeam: away.team.displayName,
      awayTeamId: away.team.id,
      homeGoals: parseInt(home.score, 10) || 0,
      awayGoals: parseInt(away.score, 10) || 0,
      status,
      venue: comp.venue?.fullName ?? "",
    });
  }

  return matches;
}

// ── Teams ──────────────────────────────────────────────────────────────────

interface Team {
  espnId: string;
  name: string;
  abbreviation: string;
  logoUrl: string;
  color: string;
}

async function fetchTeams(): Promise<Team[]> {
  const url = `${BASE}/site/v2/sports/${LEAGUE}/teams`;
  const data = await fetchJson<EspnTeamsResponse>(url);

  const teams: Team[] = [];
  for (const sport of data.sports ?? []) {
    for (const league of sport.leagues ?? []) {
      for (const t of league.teams ?? []) {
        teams.push({
          espnId: t.team.id,
          name: t.team.displayName,
          abbreviation: t.team.abbreviation,
          logoUrl: t.team.logos?.[0]?.href ?? "",
          color: t.team.color ?? "",
        });
      }
    }
  }

  return teams;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching NWSL data from ESPN...\n");

  // Fetch teams
  console.log("[1/3] Teams");
  const teams = await fetchTeams();
  write("teams.json", teams);
  console.log(`  → ${teams.length} teams\n`);

  // Fetch standings
  console.log("[2/3] Standings");
  const standings2025 = await fetchStandings(2025);
  write("standings-2025.json", standings2025);
  console.log(`  → 2025: ${standings2025.length} teams`);

  const standings2026 = await fetchStandings(2026);
  write("standings-2026.json", standings2026);
  console.log(`  → 2026: ${standings2026.length} teams\n`);

  // Fetch matches in windows (ESPN limits per request)
  console.log("[3/3] Matches");
  const windows2025 = [
    ["20250301", "20250501"],
    ["20250501", "20250701"],
    ["20250701", "20250901"],
    ["20250901", "20251201"],
  ];
  let matches2025: Match[] = [];
  for (const [from, to] of windows2025) {
    const batch = await fetchMatches(from, to);
    matches2025 = matches2025.concat(batch);
  }
  // Deduplicate by matchId
  const seen2025 = new Set<string>();
  matches2025 = matches2025.filter((m) => {
    if (seen2025.has(m.matchId)) return false;
    seen2025.add(m.matchId);
    return true;
  });
  matches2025.sort((a, b) => a.date.localeCompare(b.date));
  write("matches-2025.json", matches2025);
  console.log(`  → 2025: ${matches2025.length} matches`);

  const windows2026 = [
    ["20260301", "20260407"],
    ["20260407", "20260701"],
  ];
  let matches2026: Match[] = [];
  for (const [from, to] of windows2026) {
    const batch = await fetchMatches(from, to);
    matches2026 = matches2026.concat(batch);
  }
  const seen2026 = new Set<string>();
  matches2026 = matches2026.filter((m) => {
    if (seen2026.has(m.matchId)) return false;
    seen2026.add(m.matchId);
    return true;
  });
  matches2026.sort((a, b) => a.date.localeCompare(b.date));
  write("matches-2026.json", matches2026);
  console.log(`  → 2026: ${matches2026.length} matches`);

  console.log("\nDone! ESPN data written to src/data/espn/");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
