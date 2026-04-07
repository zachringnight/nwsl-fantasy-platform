"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildSuggestedLineup,
  isLineupSlotValid,
} from "@/lib/fantasy-draft";
import type {
  FantasyLineupSlot,
  FantasyRosterPlayer,
} from "@/types/fantasy";
import {
  assertErrorMessage,
  buildAvailablePlayers,
  ensureDraftRecord,
  fetchDraftPicks,
  fetchLeagueContext,
  fetchRosterForUser,
  hydrateRosterPlayers,
} from "./shared";

async function writeLineupAssignments(
  leagueId: string,
  roster: FantasyRosterPlayer[],
  assignments: Map<string, FantasyLineupSlot | null>
) {
  const supabase = getSupabaseBrowserClient();

  if (roster.length === 0) {
    throw new Error("No roster found. Draft or claim players before setting a lineup.");
  }

  for (const player of roster) {
    const slot = assignments.get(player.id) ?? null;

    if (slot && !isLineupSlotValid(slot, player.player_position)) {
      throw new Error(`"${player.player_name}" cannot be assigned to ${slot}.`);
    }
  }

  const usedSlots = new Set<FantasyLineupSlot>();

  assignments.forEach((slot) => {
    if (!slot) {
      return;
    }

    if (usedSlots.has(slot)) {
      throw new Error("Each lineup slot can only be used once.");
    }

    usedSlots.add(slot);
  });

  const { error: clearError } = await supabase
    .from("fantasy_roster_slots")
    .update({
      lineup_slot: null,
      updated_at: new Date().toISOString(),
    })
    .eq("league_id", leagueId)
    .eq("user_id", roster[0]?.user_id ?? "");

  if (clearError) {
    throw new Error(assertErrorMessage(clearError, "Unable to reset the lineup."));
  }

  for (const player of roster) {
    const slot = assignments.get(player.id) ?? null;

    const { error } = await supabase
      .from("fantasy_roster_slots")
      .update({
        lineup_slot: slot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", player.id);

    if (error) {
      throw new Error(assertErrorMessage(error, "Unable to save the lineup."));
    }
  }
}

export async function loadRosterState(leagueId: string) {
  const { user, league } = await fetchLeagueContext(leagueId);
  const draft = await ensureDraftRecord(leagueId, league.commissioner_user_id, user.id);
  const picks = await fetchDraftPicks(leagueId);
  const roster = hydrateRosterPlayers(await fetchRosterForUser(leagueId, user.id));

  return {
    league,
    draft,
    picks,
    roster,
    availablePlayers: buildAvailablePlayers(picks),
  };
}

export async function autofillRosterLineup(leagueId: string) {
  const { roster } = await loadRosterState(leagueId);

  if (roster.length === 0) {
    throw new Error("Draft a roster before building a lineup.");
  }

  const assignments = buildSuggestedLineup(roster);
  await writeLineupAssignments(leagueId, roster, assignments);
  return loadRosterState(leagueId);
}

export async function saveRosterLineup(
  leagueId: string,
  assignments: Array<{ rosterId: string; lineupSlot: FantasyLineupSlot | null }>
) {
  const { roster } = await loadRosterState(leagueId);
  const assignmentMap = new Map<string, FantasyLineupSlot | null>();

  roster.forEach((player) => {
    assignmentMap.set(player.id, player.lineup_slot);
  });

  assignments.forEach((assignment) => {
    assignmentMap.set(assignment.rosterId, assignment.lineupSlot);
  });

  await writeLineupAssignments(leagueId, roster, assignmentMap);
  return loadRosterState(leagueId);
}
