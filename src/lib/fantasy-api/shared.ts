"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyPoolPlayer,
  FantasyRosterPlayer,
  FantasyRosterSlotRecord,
  FantasyDraftPickRecord,
  FantasyDraftRecord,
} from "@/types/fantasy";
import {
  allLineupSlots,
} from "@/lib/fantasy-draft";
import {
  getFantasyPlayerById,
  getFantasyPlayerPool,
} from "@/lib/fantasy-player-pool";

export function assertErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export type PrioritizedMembership = FantasyLeagueMembershipRecord & {
  waiver_priority: number;
};

export async function requireUser() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("Authentication required.");
  }

  return data.user;
}

export function createLeagueCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function createFallbackDraftRecord(leagueId: string): FantasyDraftRecord {
  const now = new Date().toISOString();

  return {
    league_id: leagueId,
    status: "scheduled",
    total_rounds: 12,
    order_revealed_at: null,
    current_pick_started_at: null,
    started_at: null,
    paused_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

export function sortMembershipsForDraft(memberships: FantasyLeagueMembershipRecord[]) {
  return [...memberships].sort((left, right) => {
    if (left.draft_slot != null && right.draft_slot != null) {
      return left.draft_slot - right.draft_slot;
    }

    if (left.draft_slot != null) {
      return -1;
    }

    if (right.draft_slot != null) {
      return 1;
    }

    return new Date(left.joined_at).getTime() - new Date(right.joined_at).getTime();
  });
}

export function hydrateRosterPlayers(rosterSlots: FantasyRosterSlotRecord[]) {
  return rosterSlots
    .map((slot) => {
      const player =
        getFantasyPlayerById(slot.player_id) ??
        ({
          id: slot.player_id,
          display_name: slot.player_name,
          club_name: slot.club_name,
          position: slot.player_position,
          average_points: 0,
          salary_cost: 0,
          availability: "available",
          rank: 999,
        } satisfies FantasyPoolPlayer);

      return {
        ...slot,
        player,
      } satisfies FantasyRosterPlayer;
    })
    .sort((left, right) => {
      if (left.lineup_slot && right.lineup_slot) {
        return allLineupSlots.indexOf(left.lineup_slot) - allLineupSlots.indexOf(right.lineup_slot);
      }

      if (left.lineup_slot) {
        return -1;
      }

      if (right.lineup_slot) {
        return 1;
      }

      return right.player.average_points - left.player.average_points;
    });
}

export function buildAvailablePlayers(picks: FantasyDraftPickRecord[]) {
  const pickedIds = new Set(picks.map((pick) => pick.player_id));
  return getFantasyPlayerPool().filter((player) => !pickedIds.has(player.id));
}

export async function fetchDraftRecord(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_drafts")
    .select("league_id, status, total_rounds, order_revealed_at, current_pick_started_at, started_at, paused_at, completed_at, created_at, updated_at")
    .eq("league_id", leagueId)
    .maybeSingle();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load draft state."));
  }

  return (data as FantasyDraftRecord | null) ?? null;
}

export async function fetchLeagueContext(leagueId: string) {
  const user = await requireUser();
  const { loadLeagueById } = await import("./leagues");
  const leagueDetails = await loadLeagueById(leagueId);

  if (!leagueDetails) {
    throw new Error("That league does not exist.");
  }

  if (!leagueDetails.currentMembership) {
    throw new Error("Join this league before opening league tools.");
  }

  return {
    user,
    league: leagueDetails.league,
    memberships: leagueDetails.memberships,
    myMembership: leagueDetails.currentMembership,
  };
}

export async function ensureDraftRecord(
  leagueId: string,
  commissionerUserId: string,
  currentUserId: string
) {
  const existingDraft = await fetchDraftRecord(leagueId);

  if (existingDraft) {
    return existingDraft;
  }

  if (commissionerUserId !== currentUserId) {
    return createFallbackDraftRecord(leagueId);
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_drafts")
    .upsert({
      league_id: leagueId,
      status: "scheduled",
      total_rounds: 12,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "league_id",
    })
    .select("league_id, status, total_rounds, order_revealed_at, current_pick_started_at, started_at, paused_at, completed_at, created_at, updated_at")
    .single();

  if (error) {
    const retryDraft = await fetchDraftRecord(leagueId);

    if (retryDraft) {
      return retryDraft;
    }

    throw new Error(assertErrorMessage(error, "Unable to create the draft record."));
  }

  return data as FantasyDraftRecord;
}

export async function fetchDraftPicks(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_draft_picks")
    .select("id, league_id, round_number, pick_number, overall_pick, membership_id, manager_user_id, player_id, player_name, player_position, club_name, source, picked_at")
    .eq("league_id", leagueId)
    .order("overall_pick", { ascending: true });

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load draft picks."));
  }

  return (data ?? []) as FantasyDraftPickRecord[];
}

export async function fetchQueueForUser(leagueId: string, userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_draft_queue_items")
    .select("id, league_id, user_id, player_id, player_name, player_position, club_name, priority, created_at, updated_at")
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load the draft queue."));
  }

  return (data ?? []) as import("@/types/fantasy").FantasyDraftQueueItemRecord[];
}

export async function fetchRosterForUser(leagueId: string, userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_roster_slots")
    .select("id, league_id, user_id, player_id, player_name, player_position, club_name, acquisition_source, lineup_slot, acquired_at, updated_at")
    .eq("league_id", leagueId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load roster slots."));
  }

  return (data ?? []) as FantasyRosterSlotRecord[];
}

export async function fetchRostersForLeague(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_roster_slots")
    .select("id, league_id, user_id, player_id, player_name, player_position, club_name, acquisition_source, lineup_slot, acquired_at, updated_at")
    .eq("league_id", leagueId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load league rosters."));
  }

  return (data ?? []) as FantasyRosterSlotRecord[];
}

export function assertClassicLeagueMode(league: FantasyLeagueRecord, capability: string) {
  if (league.player_ownership_mode !== "exclusive") {
    throw new Error(`${capability} is only active for classic exclusive-roster leagues right now.`);
  }
}

export function assertSalaryCapLeagueMode(league: FantasyLeagueRecord, capability: string) {
  if (league.roster_build_mode !== "salary_cap") {
    throw new Error(`${capability} is only active for salary-cap leagues right now.`);
  }
}

export function buildClaimablePlayers(rosterSlots: FantasyRosterSlotRecord[]) {
  const rosteredIds = new Set(rosterSlots.map((slot) => slot.player_id));
  return getFantasyPlayerPool().filter((player) => !rosteredIds.has(player.id));
}

export async function updateDraftRow(
  leagueId: string,
  payload: Partial<FantasyDraftRecord>
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_drafts")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("league_id", leagueId)
    .select("league_id, status, total_rounds, order_revealed_at, current_pick_started_at, started_at, paused_at, completed_at, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to update the draft state."));
  }

  return data as FantasyDraftRecord;
}

export async function syncLeagueStatus(leagueId: string, status: FantasyLeagueRecord["status"]) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("fantasy_leagues")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leagueId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to update league status."));
  }
}

export async function renumberQueueItems(
  leagueId: string,
  userId: string,
  queue: import("@/types/fantasy").FantasyDraftQueueItemRecord[]
) {
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();

  const results = await Promise.all(
    queue.map((item, index) =>
      supabase
        .from("fantasy_draft_queue_items")
        .update({ priority: index + 1, updated_at: now })
        .eq("id", item.id)
        .eq("league_id", leagueId)
        .eq("user_id", userId)
    )
  );

  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    throw new Error(assertErrorMessage(firstError.error, "Unable to reorder the draft queue."));
  }
}

export async function assignDraftOrderForLeague(
  leagueId: string,
  memberships: FantasyLeagueMembershipRecord[]
) {
  const supabase = getSupabaseBrowserClient();
  const shuffled = [...memberships];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  for (const [index, membership] of shuffled.entries()) {
    const { error } = await supabase
      .from("fantasy_league_memberships")
      .update({ draft_slot: index + 1 })
      .eq("id", membership.id);

    if (error) {
      throw new Error(assertErrorMessage(error, "Unable to reveal the draft order."));
    }
  }
}
