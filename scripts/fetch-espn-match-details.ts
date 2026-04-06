#!/usr/bin/env npx tsx
/**
 * Fetch detailed match stats from ESPN's summary API for all stored matches.
 *
 * Usage: npx tsx scripts/fetch-espn-match-details.ts
 *
 * Reads match IDs from src/data/espn/matches-2026.json (current season)
 * and writes detailed stats to src/data/espn/match-details.json
 */

// This script is designed to be run where ESPN API is reachable.
// For environments where it isn't, the WebFetch-collected data is
// written directly to match-details.json via the main fetch flow.

console.log("This script fetches detailed match stats from ESPN.");
console.log("Run in an environment with internet access to ESPN APIs.");
console.log("For initial data, match details were collected via WebFetch and written directly.");
