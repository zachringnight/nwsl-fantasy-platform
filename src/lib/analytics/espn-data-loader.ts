/**
 * Loads pre-fetched ESPN NWSL data from static JSON files.
 *
 * Data is fetched by running: npx tsx scripts/fetch-espn-nwsl.ts
 * JSON files live in src/data/espn/ and are committed to the repo.
 */

import standings2025 from "@/data/espn/standings-2025.json";
import standings2026 from "@/data/espn/standings-2026.json";
import matches2025 from "@/data/espn/matches-2025.json";
import matches2026 from "@/data/espn/matches-2026.json";
import teams from "@/data/espn/teams.json";
import matchDetailsRaw from "@/data/espn/match-details.json";

// ── Types for the JSON shape ───────────────────────────────────────────────

export interface EspnStanding {
  rank: number;
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

export interface EspnMatch {
  matchId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  status: "completed" | "upcoming" | "live";
  venue: string;
}

export interface EspnTeam {
  espnId: string;
  name: string;
  abbreviation: string;
}

// ── Accessors ──────────────────────────────────────────────────────────────

export function getEspnStandings2025(): EspnStanding[] {
  return standings2025 as EspnStanding[];
}

export function getEspnStandings2026(): EspnStanding[] {
  return standings2026 as EspnStanding[];
}

export function getEspnMatches2025(): EspnMatch[] {
  return matches2025 as EspnMatch[];
}

export function getEspnMatches2026(): EspnMatch[] {
  return matches2026 as EspnMatch[];
}

export function getAllEspnMatches(): EspnMatch[] {
  return [...getEspnMatches2025(), ...getEspnMatches2026()];
}

export function getEspnMatchesBySeason(season: "2025" | "2026"): EspnMatch[] {
  return season === "2025" ? getEspnMatches2025() : getEspnMatches2026();
}

export function getEspnStandingsBySeason(season: "2025" | "2026"): EspnStanding[] {
  return season === "2025" ? getEspnStandings2025() : getEspnStandings2026();
}

export function getEspnTeams(): EspnTeam[] {
  return teams as EspnTeam[];
}

// ── Match Details ──────────────────────────────────────────────────────────

export interface EspnMatchEvent {
  minute: number;
  type: "goal" | "yellow_card" | "red_card" | "substitution";
  team: string;
  playerName: string;
}

export interface EspnMatchDetail {
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homePossession: number;
  awayPossession: number;
  homeCorners: number;
  awayCorners: number;
  homeFouls: number;
  awayFouls: number;
  events: EspnMatchEvent[];
}

const matchDetails = matchDetailsRaw as Record<string, EspnMatchDetail>;

export function getEspnMatchDetail(matchId: string): EspnMatchDetail | undefined {
  return matchDetails[matchId];
}
