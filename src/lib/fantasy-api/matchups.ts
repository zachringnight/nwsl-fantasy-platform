"use client";

import {
  buildSimulatedMatchup,
  buildSimulatedStandings,
} from "@/lib/fantasy-season-sim";
import type {
  FantasyLeagueMatchupState,
  FantasyRosterPlayer,
  FantasyStandingsState,
} from "@/types/fantasy";
import {
  assertClassicLeagueMode,
  fetchLeagueContext,
  fetchRostersForLeague,
  hydrateRosterPlayers,
} from "./shared";

export async function loadLeagueStandings(leagueId: string) {
  const { league, memberships } = await fetchLeagueContext(leagueId);
  assertClassicLeagueMode(league, "Standings");
  const rosterSlots = await fetchRostersForLeague(leagueId);
  const rostersByUserId = new Map<string, FantasyRosterPlayer[]>();

  memberships.forEach((membership) => {
    rostersByUserId.set(
      membership.user_id,
      hydrateRosterPlayers(
        rosterSlots.filter((slot) => slot.user_id === membership.user_id)
      )
    );
  });

  const simulated = buildSimulatedStandings(memberships, rostersByUserId);

  return {
    league,
    completed_weeks: simulated.completedWeeks,
    playoff_cutoff: Math.min(4, memberships.length),
    standings: simulated.standings,
  } satisfies FantasyStandingsState;
}

export async function loadLeagueMatchup(leagueId: string, options?: { weekNumber?: number }) {
  const { league, memberships, myMembership } = await fetchLeagueContext(leagueId);
  assertClassicLeagueMode(league, "Matchup scoring");
  const rosterSlots = await fetchRostersForLeague(leagueId);
  const rostersByUserId = new Map<string, FantasyRosterPlayer[]>();

  memberships.forEach((membership) => {
    rostersByUserId.set(
      membership.user_id,
      hydrateRosterPlayers(
        rosterSlots.filter((slot) => slot.user_id === membership.user_id)
      )
    );
  });

  return buildSimulatedMatchup(
    league,
    myMembership,
    memberships,
    rostersByUserId,
    options?.weekNumber
  ) satisfies FantasyLeagueMatchupState;
}
