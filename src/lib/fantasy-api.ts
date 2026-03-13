"use client";

import {
  allLineupSlots,
  buildSnakeTurn,
  buildSuggestedLineup,
  chooseAutopickPlayer,
  isLineupSlotValid,
  validateDraftPick,
} from "@/lib/fantasy-draft";
import {
  getFantasyPlayerById,
  getFantasyPlayerPool,
} from "@/lib/fantasy-player-pool";
import {
  buildSimulatedMatchup,
  buildSimulatedStandings,
} from "@/lib/fantasy-season-sim";
import {
  buildSalaryCapAutofillSelections,
  buildSalaryCapEntrySummary,
  buildSalaryCapEntryWindowState,
  isPlayerEligibleForSalaryCapSlot,
  isSalaryCapEntryLocked,
  salaryCapLineupSlots,
} from "@/lib/fantasy-salary-cap";
import {
  getFantasyLeagueModeFields,
  getFantasyModeConfig,
} from "@/lib/fantasy-modes";
import {
  getFantasyDefaultLockAt,
  getFantasySlateWindows,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  FantasyDraftPickRecord,
  FantasyDraftQueueItemRecord,
  FantasyDraftRecord,
  FantasyDraftState,
  FantasyExperienceLevel,
  FantasyGameVariant,
  FantasyLeagueDetails,
  FantasyLeagueMatchupState,
  FantasyLeaguePlayerListing,
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyLeagueSummary,
  FantasyLineupSlot,
  FantasyPoolPlayer,
  FantasyProfile,
  FantasyRosterPlayer,
  FantasyRosterSlotRecord,
  FantasySalaryCapEntryRecord,
  FantasySalaryCapEntrySlotRecord,
  FantasySalaryCapEntryState,
  FantasySalaryCapLineupSlot,
  FantasySlateWindow,
  FantasyStandingsState,
  FantasyTransactionHubState,
  FantasyTransactionRecord,
  FantasyWaiverClaimRecord,
} from "@/types/fantasy";

function assertErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

type PrioritizedMembership = FantasyLeagueMembershipRecord & {
  waiver_priority: number;
};

async function requireUser() {
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

function createLeagueCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createFallbackDraftRecord(leagueId: string): FantasyDraftRecord {
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

function sortMembershipsForDraft(memberships: FantasyLeagueMembershipRecord[]) {
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

function hydrateRosterPlayers(rosterSlots: FantasyRosterSlotRecord[]) {
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

function buildAvailablePlayers(picks: FantasyDraftPickRecord[]) {
  const pickedIds = new Set(picks.map((pick) => pick.player_id));
  return getFantasyPlayerPool().filter((player) => !pickedIds.has(player.id));
}

async function fetchDraftRecord(leagueId: string) {
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

async function fetchLeagueContext(leagueId: string) {
  const user = await requireUser();
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

async function ensureDraftRecord(
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

async function fetchDraftPicks(leagueId: string) {
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

async function fetchQueueForUser(leagueId: string, userId: string) {
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

  return (data ?? []) as FantasyDraftQueueItemRecord[];
}

async function fetchRosterForUser(leagueId: string, userId: string) {
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

async function fetchRostersForLeague(leagueId: string) {
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

async function fetchSalaryCapEntryForUser(
  leagueId: string,
  userId: string,
  slateKey: string
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_salary_cap_entries")
    .select("id, league_id, user_id, slate_key, entry_name, status, salary_spent, submitted_at, created_at, updated_at")
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .eq("slate_key", slateKey)
    .maybeSingle();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load the salary-cap entry."));
  }

  return (data as FantasySalaryCapEntryRecord | null) ?? null;
}

async function createSalaryCapEntry(
  leagueId: string,
  userId: string,
  slate: FantasySlateWindow,
  entryName: string
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_salary_cap_entries")
    .upsert(
      {
        league_id: leagueId,
        user_id: userId,
        slate_key: slate.key,
        entry_name: entryName,
        updated_at: new Date().toISOString(),
      },
      {
        ignoreDuplicates: true,
        onConflict: "league_id,user_id,slate_key",
      }
    )
    .select("id, league_id, user_id, slate_key, entry_name, status, salary_spent, submitted_at, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to create the salary-cap entry."));
  }

  if (data) {
    return data as FantasySalaryCapEntryRecord;
  }

  const existingEntry = await fetchSalaryCapEntryForUser(leagueId, userId, slate.key);

  if (!existingEntry) {
    throw new Error("Unable to create the salary-cap entry.");
  }

  return existingEntry;
}

async function ensureSalaryCapEntry(
  leagueId: string,
  userId: string,
  membership: FantasyLeagueMembershipRecord,
  slate: FantasySlateWindow
) {
  const existing = await fetchSalaryCapEntryForUser(leagueId, userId, slate.key);

  if (existing) {
    return existing;
  }

  const entryName = `${membership.team_name || membership.display_name} ${slate.label}`;
  try {
    return await createSalaryCapEntry(leagueId, userId, slate, entryName.trim());
  } catch (creationError) {
    const retryEntry = await fetchSalaryCapEntryForUser(leagueId, userId, slate.key);

    if (retryEntry) {
      return retryEntry;
    }

    throw creationError;
  }
}

async function fetchSalaryCapEntrySlots(entryId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_salary_cap_entry_slots")
    .select("id, entry_id, league_id, user_id, lineup_slot, player_id, player_name, player_position, club_name, salary_cost, created_at, updated_at")
    .eq("entry_id", entryId);

  if (error) {
    throw new Error(
      assertErrorMessage(error, "Unable to load the saved salary-cap slots.")
    );
  }

  return (data ?? []) as FantasySalaryCapEntrySlotRecord[];
}

async function fetchWaiverClaimsForLeague(leagueId: string, statuses?: FantasyWaiverClaimRecord["status"][]) {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("fantasy_waiver_claims")
    .select("id, league_id, user_id, requested_player_id, requested_player_name, requested_player_position, requested_club_name, drop_roster_slot_id, dropped_player_id, dropped_player_name, dropped_player_position, dropped_club_name, priority_at_submission, status, resolution_note, processed_at, created_at, updated_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load waiver claims."));
  }

  return (data ?? []) as FantasyWaiverClaimRecord[];
}

async function fetchTransactionsForLeague(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_transactions")
    .select("id, league_id, user_id, type, status, player_id, player_name, player_position, club_name, related_waiver_claim_id, dropped_player_id, dropped_player_name, dropped_player_position, dropped_club_name, note, processed_at, created_at, updated_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load transaction history."));
  }

  return (data ?? []) as FantasyTransactionRecord[];
}

function buildClaimablePlayers(rosterSlots: FantasyRosterSlotRecord[]) {
  const rosteredIds = new Set(rosterSlots.map((slot) => slot.player_id));
  return getFantasyPlayerPool().filter((player) => !rosteredIds.has(player.id));
}

function assertClassicLeagueMode(league: FantasyLeagueRecord, capability: string) {
  if (league.player_ownership_mode !== "exclusive") {
    throw new Error(`${capability} is only active for classic exclusive-roster leagues right now.`);
  }
}

function assertSalaryCapLeagueMode(league: FantasyLeagueRecord, capability: string) {
  if (league.roster_build_mode !== "salary_cap") {
    throw new Error(`${capability} is only active for salary-cap leagues right now.`);
  }
}

function resolveSalaryCapSlate(league: FantasyLeagueRecord, requestedSlateKey?: string) {
  return getFantasyTargetSlate(league, requestedSlateKey);
}

function buildSalaryCapLockErrorMessage(
  league: FantasyLeagueRecord,
  slate: FantasySlateWindow,
  capability: string
) {
  const modeConfig = getFantasyModeConfig(league);

  return `${capability} is locked because ${modeConfig.scheduleLabel.toLowerCase()} for ${slate.label} passed on ${new Date(slate.lock_at).toLocaleString()}.`;
}

function assertSalaryCapEntryUnlocked(
  league: FantasyLeagueRecord,
  slate: FantasySlateWindow,
  capability: string
) {
  if (isSalaryCapEntryLocked(slate)) {
    throw new Error(buildSalaryCapLockErrorMessage(league, slate, capability));
  }
}

function resolveSalaryCapDraftStatus(summary: { isComplete: boolean }) {
  return summary.isComplete ? "saved" : "draft";
}

function buildSalaryCapEntryState(
  league: FantasyLeagueRecord,
  myMembership: FantasyLeagueMembershipRecord,
  slate: FantasySlateWindow,
  availableSlates: FantasySlateWindow[],
  entry: FantasySalaryCapEntryRecord,
  slotRecords: FantasySalaryCapEntrySlotRecord[]
) {
  const slotRecordBySlot = new Map(
    slotRecords.map((slotRecord) => [slotRecord.lineup_slot, slotRecord] as const)
  );
  const slots = salaryCapLineupSlots.map((lineupSlot) => {
    const record = slotRecordBySlot.get(lineupSlot) ?? null;

    return {
      lineup_slot: lineupSlot,
      player: record ? getFantasyPlayerById(record.player_id) : null,
      record,
    };
  });
  const salaryCapAmount = league.salary_cap_amount ?? 0;
  const summary = buildSalaryCapEntrySummary(
    slots.map((slot) => ({
      lineup_slot: slot.lineup_slot,
      player: slot.player,
    })),
    salaryCapAmount
  );

  return {
    league,
    myMembership,
    entry,
    slate,
    available_slates: availableSlates,
    entry_window: buildSalaryCapEntryWindowState(league, entry, summary, slate),
    slots,
    available_players: getFantasyPlayerPool(),
    salary_spent: summary.salarySpent,
    remaining_budget: summary.remainingBudget,
    projected_points: summary.projectedPoints,
    selected_count: summary.selectedCount,
    is_complete: summary.isComplete,
  } satisfies FantasySalaryCapEntryState;
}

function normalizeSalaryCapAssignments(
  assignments: Array<{
    lineupSlot: FantasySalaryCapLineupSlot;
    playerId: string | null;
  }>
) {
  const assignmentMap = new Map<FantasySalaryCapLineupSlot, string | null>();

  salaryCapLineupSlots.forEach((slot) => {
    assignmentMap.set(slot, null);
  });

  assignments.forEach((assignment) => {
    if (!salaryCapLineupSlots.includes(assignment.lineupSlot)) {
      throw new Error(`"${assignment.lineupSlot}" is not a salary-cap lineup slot.`);
    }

    assignmentMap.set(assignment.lineupSlot, assignment.playerId);
  });

  return salaryCapLineupSlots.map((slot) => ({
    lineupSlot: slot,
    playerId: assignmentMap.get(slot) ?? null,
  }));
}

function validateSalaryCapAssignments(
  league: FantasyLeagueRecord,
  assignments: Array<{
    lineupSlot: FantasySalaryCapLineupSlot;
    playerId: string | null;
  }>
) {
  const salaryCapAmount = league.salary_cap_amount;

  if (!salaryCapAmount) {
    throw new Error("This league does not have a salary-cap amount configured yet.");
  }

  const normalizedAssignments = normalizeSalaryCapAssignments(assignments);
  const usedPlayerIds = new Set<string>();
  const selectedPlayers: Array<{
    lineupSlot: FantasySalaryCapLineupSlot;
    player: FantasyPoolPlayer;
  }> = [];

  normalizedAssignments.forEach((assignment) => {
    if (!assignment.playerId) {
      return;
    }

    const player = getFantasyPlayerById(assignment.playerId);

    if (!player) {
      throw new Error("One of the selected players is no longer in the salary-cap pool.");
    }

    if (!isPlayerEligibleForSalaryCapSlot(player, assignment.lineupSlot)) {
      throw new Error(
        `${player.display_name} cannot be assigned to ${assignment.lineupSlot}.`
      );
    }

    if (usedPlayerIds.has(player.id)) {
      throw new Error("A salary-cap entry cannot use the same player twice.");
    }

    usedPlayerIds.add(player.id);
    selectedPlayers.push({
      lineupSlot: assignment.lineupSlot,
      player,
    });
  });

  const summary = buildSalaryCapEntrySummary(
    normalizedAssignments.map((assignment) => ({
      lineup_slot: assignment.lineupSlot,
      player: assignment.playerId ? getFantasyPlayerById(assignment.playerId) : null,
    })),
    salaryCapAmount
  );

  if (summary.isOverCap) {
    throw new Error(`This entry is $${Math.abs(summary.remainingBudget)} over the salary cap.`);
  }

  return {
    normalizedAssignments,
    selectedPlayers,
    summary,
  };
}

async function updateSalaryCapEntryRecord(
  entryId: string,
  payload: Partial<FantasySalaryCapEntryRecord>
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fantasy_salary_cap_entries")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .select("id, league_id, user_id, slate_key, entry_name, status, salary_spent, submitted_at, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to update the salary-cap entry."));
  }

  return data as FantasySalaryCapEntryRecord;
}

async function replaceSalaryCapEntrySlots(
  entry: FantasySalaryCapEntryRecord,
  selectedPlayers: Array<{
    lineupSlot: FantasySalaryCapLineupSlot;
    player: FantasyPoolPlayer;
  }>
) {
  const supabase = getSupabaseBrowserClient();
  const { error: deleteError } = await supabase
    .from("fantasy_salary_cap_entry_slots")
    .delete()
    .eq("entry_id", entry.id);

  if (deleteError) {
    throw new Error(
      assertErrorMessage(deleteError, "Unable to clear the saved salary-cap slots.")
    );
  }

  if (selectedPlayers.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("fantasy_salary_cap_entry_slots")
    .insert(
      selectedPlayers.map((selection) => ({
        entry_id: entry.id,
        league_id: entry.league_id,
        user_id: entry.user_id,
        lineup_slot: selection.lineupSlot,
        player_id: selection.player.id,
        player_name: selection.player.display_name,
        player_position: selection.player.position,
        club_name: selection.player.club_name,
        salary_cost: selection.player.salary_cost,
        updated_at: new Date().toISOString(),
      }))
    );

  if (insertError) {
    throw new Error(
      assertErrorMessage(insertError, "Unable to save the selected salary-cap players.")
    );
  }
}

async function renumberQueueItems(
  leagueId: string,
  userId: string,
  queue: FantasyDraftQueueItemRecord[]
) {
  const supabase = getSupabaseBrowserClient();

  for (const [index, item] of queue.entries()) {
    const { error } = await supabase
      .from("fantasy_draft_queue_items")
      .update({
        priority: index + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("league_id", leagueId)
      .eq("user_id", userId);

    if (error) {
      throw new Error(assertErrorMessage(error, "Unable to reorder the draft queue."));
    }
  }
}

async function assignDraftOrderForLeague(
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

async function updateDraftRow(
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

async function syncLeagueStatus(leagueId: string, status: FantasyLeagueRecord["status"]) {
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

async function writeLineupAssignments(
  leagueId: string,
  roster: FantasyRosterPlayer[],
  assignments: Map<string, FantasyLineupSlot | null>
) {
  const supabase = getSupabaseBrowserClient();

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

async function recordDraftPick(
  leagueId: string,
  player: FantasyPoolPlayer,
  source: FantasyDraftPickRecord["source"],
  actorUserId: string
) {
  const supabase = getSupabaseBrowserClient();
  const { league, memberships } = await fetchLeagueContext(leagueId);
  const draft = await ensureDraftRecord(leagueId, league.commissioner_user_id, actorUserId);

  if (draft.status !== "live") {
    throw new Error("The draft is not live.");
  }

  const picks = await fetchDraftPicks(leagueId);
  const orderedMemberships = sortMembershipsForDraft(memberships);
  const currentTurn = buildSnakeTurn(orderedMemberships, picks.length + 1, draft.total_rounds);

  if (!currentTurn?.membership) {
    throw new Error("That draft is already complete.");
  }

  const isCommissioner = league.commissioner_user_id === actorUserId;

  if (currentTurn.membership.user_id !== actorUserId && !isCommissioner) {
    throw new Error("It is not your turn to draft.");
  }

  if (picks.some((pick) => pick.player_id === player.id)) {
    throw new Error("That player has already been drafted.");
  }

  const managerRosterSlots = await fetchRosterForUser(
    leagueId,
    currentTurn.membership.user_id
  );
  const managerRoster = hydrateRosterPlayers(managerRosterSlots);
  const pickValidationError = validateDraftPick(player, managerRoster);

  if (pickValidationError) {
    throw new Error(pickValidationError);
  }

  const insertSource =
    currentTurn.membership.user_id === actorUserId && source === "manual"
      ? "manual"
      : source;

  const { error: pickError } = await supabase.from("fantasy_draft_picks").insert({
    league_id: leagueId,
    round_number: currentTurn.roundNumber,
    pick_number: currentTurn.pickNumber,
    overall_pick: currentTurn.overallPick,
    membership_id: currentTurn.membership.id,
    manager_user_id: currentTurn.membership.user_id,
    player_id: player.id,
    player_name: player.display_name,
    player_position: player.position,
    club_name: player.club_name,
    source: insertSource,
  });

  if (pickError) {
    throw new Error(assertErrorMessage(pickError, "Unable to record that draft pick."));
  }

  const { error: rosterError } = await supabase.from("fantasy_roster_slots").insert({
    league_id: leagueId,
    user_id: currentTurn.membership.user_id,
    player_id: player.id,
    player_name: player.display_name,
    player_position: player.position,
    club_name: player.club_name,
    acquisition_source: "draft",
    updated_at: new Date().toISOString(),
  });

  if (rosterError) {
    throw new Error(assertErrorMessage(rosterError, "Unable to add that player to the roster."));
  }

  const { error: queueDeleteError } = await supabase
    .from("fantasy_draft_queue_items")
    .delete()
    .eq("league_id", leagueId)
    .eq("user_id", currentTurn.membership.user_id)
    .eq("player_id", player.id);

  if (queueDeleteError) {
    throw new Error(assertErrorMessage(queueDeleteError, "Unable to update the queue after that pick."));
  }

  if (currentTurn.isFinalPick) {
    await updateDraftRow(leagueId, {
      status: "complete",
      completed_at: new Date().toISOString(),
      current_pick_started_at: null,
    });
    await syncLeagueStatus(leagueId, "ready");
  } else {
    await updateDraftRow(leagueId, {
      current_pick_started_at: new Date().toISOString(),
      started_at: draft.started_at ?? new Date().toISOString(),
      paused_at: null,
    });
  }
}

export async function ensureHostedSession() {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(assertErrorMessage(error, "Unable to start a hosted session."));
  }

  return data.user;
}

export async function fetchCurrentProfile() {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session?.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("fantasy_profiles")
    .select("user_id, email, display_name, favorite_club, experience_level, onboarding_complete, created_at, updated_at")
    .eq("user_id", sessionData.session.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load the current profile."));
  }

  return data as FantasyProfile | null;
}

export async function upsertFantasyProfile(input: {
  displayName: string;
  favoriteClub?: string;
  experienceLevel?: FantasyExperienceLevel;
  onboardingComplete: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const normalizedEmail = user.email?.trim() ? user.email : null;
  const payload = {
    user_id: user.id,
    email: normalizedEmail,
    display_name: input.displayName.trim(),
    favorite_club: input.favoriteClub?.trim() || null,
    experience_level: input.experienceLevel ?? null,
    onboarding_complete: input.onboardingComplete,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("fantasy_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, email, display_name, favorite_club, experience_level, onboarding_complete, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to save the hosted profile."));
  }

  return data as FantasyProfile;
}

export async function loadMyLeagues() {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const { data, error } = await supabase
    .from("fantasy_league_memberships")
    .select(`
      role,
      league:fantasy_leagues!inner (
        id,
        name,
        code,
        privacy,
        status,
        game_variant,
        roster_build_mode,
        player_ownership_mode,
        contest_horizon,
        salary_cap_amount,
        manager_count_target,
        draft_at,
        commissioner_user_id
      )
    `)
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to load your leagues."));
  }

  const rawMemberships = (data ?? []).map((membership) => {
    const leagueRecord = Array.isArray(membership.league)
      ? membership.league[0]
      : membership.league;

    return {
      league: leagueRecord as FantasyLeagueRecord,
      membershipRole: membership.role as "commissioner" | "manager",
    };
  });

  const leagueIds = rawMemberships.map((membership) => membership.league.id);

  if (leagueIds.length === 0) {
    return [] satisfies FantasyLeagueSummary[];
  }

  const { data: memberRows, error: memberError } = await supabase
    .from("fantasy_league_memberships")
    .select("league_id")
    .in("league_id", leagueIds);

  if (memberError) {
    throw new Error(assertErrorMessage(memberError, "Unable to count league members."));
  }

  const memberCountMap = (memberRows ?? []).reduce<Record<string, number>>((accumulator, row) => {
    const leagueId = row.league_id as string;
    accumulator[leagueId] = (accumulator[leagueId] ?? 0) + 1;
    return accumulator;
  }, {});

  return rawMemberships.map((membership) => ({
    league: membership.league,
    memberCount: memberCountMap[membership.league.id] ?? 1,
    membershipRole: membership.membershipRole,
  }));
}

export async function loadLeagueById(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const { data: league, error: leagueError } = await supabase
    .from("fantasy_leagues")
    .select("id, name, code, privacy, status, game_variant, roster_build_mode, player_ownership_mode, contest_horizon, salary_cap_amount, manager_count_target, draft_at, commissioner_user_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) {
    throw new Error(assertErrorMessage(leagueError, "Unable to load that league."));
  }

  if (!league) {
    return null;
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("fantasy_league_memberships")
    .select("id, league_id, user_id, role, display_name, team_name, joined_at, draft_slot, waiver_priority")
    .eq("league_id", leagueId)
    .order("joined_at", { ascending: true });

  if (membershipsError) {
    throw new Error(assertErrorMessage(membershipsError, "Unable to load league members."));
  }

  const typedMemberships = (memberships ?? []) as FantasyLeagueMembershipRecord[];

  return {
    currentMembership:
      typedMemberships.find((membership) => membership.user_id === user.id) ?? null,
    league: league as FantasyLeagueRecord,
    memberships: typedMemberships,
  } satisfies FantasyLeagueDetails;
}

export async function createHostedLeague(input: {
  draftAt?: string;
  gameVariant: FantasyGameVariant;
  managerCountTarget: number;
  name: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const profile = await fetchCurrentProfile();
  const modeFields = getFantasyLeagueModeFields(input.gameVariant);

  if (!profile) {
    throw new Error("Create a hosted profile before creating a league.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createLeagueCode();
    const scheduledAt = modeFields.roster_build_mode === "salary_cap"
      ? getFantasyDefaultLockAt(input.gameVariant)
      : input.draftAt
        ? new Date(input.draftAt).toISOString()
        : null;

    if (!scheduledAt) {
      throw new Error("Choose a draft date and time for this classic league.");
    }

    const { data: league, error: leagueError } = await supabase
      .from("fantasy_leagues")
      .insert({
        code,
        commissioner_user_id: user.id,
        contest_horizon: modeFields.contest_horizon,
        draft_at: scheduledAt,
        game_variant: input.gameVariant,
        manager_count_target: input.managerCountTarget,
        name: input.name.trim(),
        player_ownership_mode: modeFields.player_ownership_mode,
        roster_build_mode: modeFields.roster_build_mode,
        salary_cap_amount: modeFields.salary_cap_amount,
        updated_at: new Date().toISOString(),
      })
      .select("id, code")
      .single();

    if (leagueError) {
      if (leagueError.code === "23505") {
        continue;
      }

      throw new Error(assertErrorMessage(leagueError, "Unable to create that league."));
    }

    const { error: membershipError } = await supabase
      .from("fantasy_league_memberships")
      .insert({
        display_name: profile.display_name,
        league_id: league.id,
        role: "commissioner",
        team_name: `${profile.display_name} FC`,
        user_id: user.id,
      });

    if (membershipError) {
      await supabase.from("fantasy_leagues").delete().eq("id", league.id);
      throw new Error(assertErrorMessage(membershipError, "Unable to add the commissioner to the league."));
    }

    return {
      code: league.code as string,
      id: league.id as string,
    };
  }

  throw new Error("Unable to generate a unique league code.");
}

export async function updateLeagueSettings(
  leagueId: string,
  updates: { name?: string; draftAt?: string; managerCountTarget?: number }
) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();

  // Verify commissioner ownership
  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("commissioner_user_id")
    .eq("id", leagueId)
    .single();

  if (!league || league.commissioner_user_id !== user.id) {
    throw new Error("Only the commissioner can update league settings.");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.draftAt !== undefined) patch.draft_at = new Date(updates.draftAt).toISOString();
  if (updates.managerCountTarget !== undefined) patch.manager_count_target = updates.managerCountTarget;

  const { error } = await supabase
    .from("fantasy_leagues")
    .update(patch)
    .eq("id", leagueId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to save league settings."));
  }
}

export async function loadLeaguePlayerListings(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const { league, memberships } = await fetchLeagueContext(leagueId);
  const draftedByPlayerId = new Map<
    string,
    { displayName: string | null; userId: string | null }
  >();

  if (league.player_ownership_mode === "exclusive") {
    const { data: rosterRows, error: rosterError } = await supabase
      .from("fantasy_roster_slots")
      .select("player_id, user_id")
      .eq("league_id", leagueId);

    if (rosterError) {
      throw new Error(
        assertErrorMessage(rosterError, "Unable to load league player ownership.")
      );
    }

    const displayNameByUserId = new Map(
      memberships.map((membership) => [membership.user_id, membership.display_name])
    );

    (rosterRows ?? []).forEach((row) => {
      draftedByPlayerId.set(row.player_id as string, {
        displayName: displayNameByUserId.get(row.user_id as string) ?? null,
        userId: (row.user_id as string) ?? null,
      });
    });
  }

  return {
    league,
    players: getFantasyPlayerPool().map((player) => {
      const draftedBy = draftedByPlayerId.get(player.id);

      return {
        player,
        ownership_status: draftedBy
          ? "drafted"
          : league.player_ownership_mode === "shared"
            ? "shared_pool"
            : "available",
        rostered_by_display_name: draftedBy?.displayName ?? null,
        rostered_by_user_id: draftedBy?.userId ?? null,
      } satisfies FantasyLeaguePlayerListing;
    }),
  };
}

function sortMembershipsForWaivers(memberships: FantasyLeagueMembershipRecord[]) {
  return [...memberships].sort((left, right) => {
    if (left.waiver_priority != null && right.waiver_priority != null) {
      return left.waiver_priority - right.waiver_priority;
    }

    if (left.waiver_priority != null) {
      return -1;
    }

    if (right.waiver_priority != null) {
      return 1;
    }

    return new Date(left.joined_at).getTime() - new Date(right.joined_at).getTime();
  });
}

async function updateMembershipWaiverPriorities(
  leagueId: string,
  memberships: PrioritizedMembership[]
) {
  const supabase = getSupabaseBrowserClient();

  for (const [index, membership] of memberships.entries()) {
    const { error } = await supabase
      .from("fantasy_league_memberships")
      .update({
        waiver_priority: -(index + 1),
      })
      .eq("id", membership.id)
      .eq("league_id", leagueId);

    if (error) {
      throw new Error(assertErrorMessage(error, "Unable to update waiver priority."));
    }
  }

  for (const membership of memberships) {
    const { error } = await supabase
      .from("fantasy_league_memberships")
      .update({
        waiver_priority: membership.waiver_priority,
      })
      .eq("id", membership.id)
      .eq("league_id", leagueId);

    if (error) {
      throw new Error(assertErrorMessage(error, "Unable to update waiver priority."));
    }
  }
}

async function updateWaiverClaimRecord(
  claimId: string,
  payload: Partial<FantasyWaiverClaimRecord>
) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("fantasy_waiver_claims")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to update the waiver claim."));
  }
}

async function insertTransactionRecords(
  records: Array<{
    league_id: string;
    user_id: string;
    type: FantasyTransactionRecord["type"];
    status: FantasyTransactionRecord["status"];
    player_id: string;
    player_name: string;
    player_position: FantasyTransactionRecord["player_position"];
    club_name: string;
    related_waiver_claim_id?: string | null;
    dropped_player_id?: string | null;
    dropped_player_name?: string | null;
    dropped_player_position?: FantasyTransactionRecord["dropped_player_position"];
    dropped_club_name?: string | null;
    note?: string | null;
    processed_at?: string | null;
  }>
) {
  if (records.length === 0) {
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("fantasy_transactions").insert(
    records.map((record) => ({
      ...record,
      updated_at: new Date().toISOString(),
    }))
  );

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to record the transaction history."));
  }
}

function rotateWaiverPriorityAfterWin(
  memberships: PrioritizedMembership[],
  winnerUserId: string
): PrioritizedMembership[] {
  const ordered = sortMembershipsForWaivers(memberships) as PrioritizedMembership[];
  const winner = ordered.find((membership) => membership.user_id === winnerUserId);

  if (!winner?.waiver_priority) {
    return ordered.map((membership) => ({
      ...membership,
      waiver_priority: membership.waiver_priority ?? ordered.length,
    }));
  }

  const maxPriority = ordered.length;

  return ordered.map((membership) => {
    if ((membership.waiver_priority ?? maxPriority) < winner.waiver_priority!) {
      return membership;
    }

    if (membership.user_id === winnerUserId) {
      return {
        ...membership,
        waiver_priority: maxPriority,
      };
    }

    return {
      ...membership,
      waiver_priority: (membership.waiver_priority ?? maxPriority) - 1,
    };
  });
}

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

export async function loadLeagueMatchup(leagueId: string) {
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
    rostersByUserId
  ) satisfies FantasyLeagueMatchupState;
}

export async function loadSalaryCapEntryState(
  leagueId: string,
  options?: {
    slateKey?: string;
  }
) {
  const { user, league, myMembership } = await fetchLeagueContext(leagueId);
  assertSalaryCapLeagueMode(league, "Salary-cap entry building");
  const availableSlates = getFantasySlateWindows(league);
  const activeSlate = resolveSalaryCapSlate(league, options?.slateKey);
  const entry = await ensureSalaryCapEntry(leagueId, user.id, myMembership, activeSlate);
  const slotRecords = await fetchSalaryCapEntrySlots(entry.id);

  return buildSalaryCapEntryState(
    league,
    myMembership,
    activeSlate,
    availableSlates,
    entry,
    slotRecords
  );
}

export async function saveSalaryCapEntry(
  leagueId: string,
  input: {
    slateKey?: string;
    entryName?: string;
    assignments: Array<{
      lineupSlot: FantasySalaryCapLineupSlot;
      playerId: string | null;
    }>;
  }
) {
  const { user, league, myMembership } = await fetchLeagueContext(leagueId);
  assertSalaryCapLeagueMode(league, "Salary-cap entry building");
  const slate = resolveSalaryCapSlate(league, input.slateKey);
  const existingEntry = await ensureSalaryCapEntry(leagueId, user.id, myMembership, slate);
  assertSalaryCapEntryUnlocked(league, slate, "Salary-cap entry editing");

  if (existingEntry.status === "submitted") {
    throw new Error("Reopen the submitted entry before saving changes.");
  }

  const { selectedPlayers, summary } = validateSalaryCapAssignments(
    league,
    input.assignments
  );
  const entryName =
    input.entryName?.trim() ||
    existingEntry.entry_name ||
    `${myMembership.team_name || myMembership.display_name} ${slate.label}`;
  const nextEntry = await updateSalaryCapEntryRecord(existingEntry.id, {
    entry_name: entryName,
    salary_spent: summary.salarySpent,
    status: resolveSalaryCapDraftStatus(summary),
    submitted_at: null,
  });

  await replaceSalaryCapEntrySlots(nextEntry, selectedPlayers);
  return loadSalaryCapEntryState(leagueId, {
    slateKey: slate.key,
  });
}

export async function clearSalaryCapEntry(leagueId: string, slateKey?: string) {
  const { user, league, myMembership } = await fetchLeagueContext(leagueId);
  assertSalaryCapLeagueMode(league, "Salary-cap entry building");
  const slate = resolveSalaryCapSlate(league, slateKey);
  const entry = await ensureSalaryCapEntry(leagueId, user.id, myMembership, slate);
  assertSalaryCapEntryUnlocked(league, slate, "Salary-cap entry editing");

  if (entry.status === "submitted") {
    throw new Error("Reopen the submitted entry before clearing it.");
  }

  await updateSalaryCapEntryRecord(entry.id, {
    salary_spent: 0,
    status: "draft",
    submitted_at: null,
  });
  await replaceSalaryCapEntrySlots(entry, []);
  return loadSalaryCapEntryState(leagueId, {
    slateKey: slate.key,
  });
}

export async function autofillSalaryCapEntry(leagueId: string, slateKey?: string) {
  const currentState = await loadSalaryCapEntryState(leagueId, {
    slateKey,
  });
  const { league, entry } = currentState;
  assertSalaryCapEntryUnlocked(league, currentState.slate, "Salary-cap autofill");

  if (entry.status === "submitted") {
    throw new Error("Reopen the submitted entry before autofilling it.");
  }

  const salaryCapAmount = currentState.league.salary_cap_amount;

  if (!salaryCapAmount) {
    throw new Error("This league does not have a salary cap configured yet.");
  }

  const selections = buildSalaryCapAutofillSelections(
    currentState.available_players,
    salaryCapAmount
  );

  return saveSalaryCapEntry(leagueId, {
    slateKey: currentState.slate.key,
    entryName: currentState.entry.entry_name,
    assignments: selections.map((selection) => ({
      lineupSlot: selection.lineup_slot,
      playerId: selection.player?.id ?? null,
    })),
  });
}

export async function submitSalaryCapEntry(
  leagueId: string,
  input: {
    slateKey?: string;
    entryName?: string;
    assignments: Array<{
      lineupSlot: FantasySalaryCapLineupSlot;
      playerId: string | null;
    }>;
  }
) {
  const { user, league, myMembership } = await fetchLeagueContext(leagueId);
  assertSalaryCapLeagueMode(league, "Salary-cap entry submission");
  const slate = resolveSalaryCapSlate(league, input.slateKey);
  const existingEntry = await ensureSalaryCapEntry(leagueId, user.id, myMembership, slate);
  assertSalaryCapEntryUnlocked(league, slate, "Salary-cap entry submission");
  const { selectedPlayers, summary } = validateSalaryCapAssignments(
    league,
    input.assignments
  );

  if (!summary.isComplete) {
    throw new Error("Fill all nine starter slots before submitting the entry.");
  }

  const entryName =
    input.entryName?.trim() ||
    existingEntry.entry_name ||
    `${myMembership.team_name || myMembership.display_name} ${slate.label}`;
  const nextEntry = await updateSalaryCapEntryRecord(existingEntry.id, {
    entry_name: entryName,
    salary_spent: summary.salarySpent,
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });

  await replaceSalaryCapEntrySlots(nextEntry, selectedPlayers);
  return loadSalaryCapEntryState(leagueId, {
    slateKey: slate.key,
  });
}

export async function reopenSalaryCapEntry(leagueId: string, slateKey?: string) {
  const { user, league, myMembership } = await fetchLeagueContext(leagueId);
  assertSalaryCapLeagueMode(league, "Salary-cap entry submission");
  const slate = resolveSalaryCapSlate(league, slateKey);
  const entry = await ensureSalaryCapEntry(leagueId, user.id, myMembership, slate);
  assertSalaryCapEntryUnlocked(league, slate, "Salary-cap entry reopening");

  if (entry.status !== "submitted") {
    throw new Error("Only submitted entries can be reopened.");
  }

  const slotRecords = await fetchSalaryCapEntrySlots(entry.id);
  const summary = buildSalaryCapEntrySummary(
    salaryCapLineupSlots.map((slot) => {
      const slotRecord = slotRecords.find((record) => record.lineup_slot === slot) ?? null;

      return {
        lineup_slot: slot,
        player: slotRecord ? getFantasyPlayerById(slotRecord.player_id) : null,
      };
    }),
    league.salary_cap_amount ?? 0
  );

  await updateSalaryCapEntryRecord(entry.id, {
    status: resolveSalaryCapDraftStatus(summary),
    submitted_at: null,
  });

  return loadSalaryCapEntryState(leagueId, {
    slateKey: slate.key,
  });
}

export async function loadTransactionHub(leagueId: string) {
  const { user, league, myMembership } = await fetchLeagueContext(leagueId);
  const roster = hydrateRosterPlayers(await fetchRosterForUser(leagueId, user.id));
  const allRosterSlots = await fetchRostersForLeague(leagueId);
  const claims = await fetchWaiverClaimsForLeague(leagueId);
  const transactionHistory = await fetchTransactionsForLeague(leagueId);
  const canCommissionerControl = league.commissioner_user_id === user.id;

  return {
    league,
    myMembership,
    roster,
    claimable_players:
      league.player_ownership_mode === "exclusive"
        ? buildClaimablePlayers(allRosterSlots)
        : [],
    pending_claims: claims.filter((claim) =>
      canCommissionerControl ? claim.status === "pending" : claim.user_id === user.id && claim.status === "pending"
    ),
    transaction_history: transactionHistory,
    waiver_priority: myMembership.waiver_priority ?? null,
    canCommissionerControl,
  } satisfies FantasyTransactionHubState;
}

export async function submitWaiverClaim(
  leagueId: string,
  input: {
    playerId: string;
    dropRosterSlotId?: string | null;
  }
) {
  const supabase = getSupabaseBrowserClient();
  const { user, league, myMembership } = await fetchLeagueContext(leagueId);
  assertClassicLeagueMode(league, "Waiver claims");
  const player = getFantasyPlayerById(input.playerId);

  if (!player) {
    throw new Error("That player is not in the launch pool.");
  }

  const rosterSlots = await fetchRostersForLeague(leagueId);
  const myRosterSlots = rosterSlots.filter((slot) => slot.user_id === user.id);
  const claimedPlayers = new Set(rosterSlots.map((slot) => slot.player_id));
  const dropSlot = input.dropRosterSlotId
    ? myRosterSlots.find((slot) => slot.id === input.dropRosterSlotId)
    : null;

  if (claimedPlayers.has(player.id)) {
    throw new Error("That player is already rostered in this league.");
  }

  if (myRosterSlots.length >= 12 && !dropSlot) {
    throw new Error("Choose a drop candidate when your roster is already full.");
  }

  if (input.dropRosterSlotId && !dropSlot) {
    throw new Error("That drop candidate is not on your roster.");
  }

  const pendingClaims = await fetchWaiverClaimsForLeague(leagueId, ["pending"]);

  if (
    pendingClaims.some(
      (claim) => claim.user_id === user.id && claim.requested_player_id === player.id
    )
  ) {
    throw new Error("You already have a pending claim for that player.");
  }

  const { error } = await supabase.from("fantasy_waiver_claims").insert({
    league_id: leagueId,
    user_id: user.id,
    requested_player_id: player.id,
    requested_player_name: player.display_name,
    requested_player_position: player.position,
    requested_club_name: player.club_name,
    drop_roster_slot_id: dropSlot?.id ?? null,
    dropped_player_id: dropSlot?.player_id ?? null,
    dropped_player_name: dropSlot?.player_name ?? null,
    dropped_player_position: dropSlot?.player_position ?? null,
    dropped_club_name: dropSlot?.club_name ?? null,
    priority_at_submission: myMembership.waiver_priority ?? 1,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to submit that waiver claim."));
  }

  return loadTransactionHub(leagueId);
}

export async function cancelWaiverClaim(leagueId: string, claimId: string) {
  const { user, league } = await fetchLeagueContext(leagueId);
  const claims = await fetchWaiverClaimsForLeague(leagueId, ["pending"]);
  const claim = claims.find((entry) => entry.id === claimId);

  if (!claim) {
    throw new Error("That pending claim does not exist.");
  }

  if (claim.user_id !== user.id && league.commissioner_user_id !== user.id) {
    throw new Error("Only the claim owner or commissioner can cancel that claim.");
  }

  await updateWaiverClaimRecord(claim.id, {
    status: "canceled",
    resolution_note: "Canceled before waiver processing.",
    processed_at: new Date().toISOString(),
  });

  return loadTransactionHub(leagueId);
}

export async function processWaiverClaims(leagueId: string) {
  const supabase = getSupabaseBrowserClient();
  const { user, league, memberships } = await fetchLeagueContext(leagueId);
  assertClassicLeagueMode(league, "Waiver processing");

  if (league.commissioner_user_id !== user.id) {
    throw new Error("Only the commissioner can process waiver claims.");
  }

  const pendingClaims = (await fetchWaiverClaimsForLeague(leagueId, ["pending"]))
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());

  if (pendingClaims.length === 0) {
    return loadTransactionHub(leagueId);
  }

  let currentMemberships: PrioritizedMembership[] = sortMembershipsForWaivers(memberships).map((membership, index) => ({
    ...membership,
    waiver_priority: membership.waiver_priority ?? index + 1,
  }));
  let rosterSlots = await fetchRostersForLeague(leagueId);
  const blockedReleasedPlayerIds = new Set<string>();
  const claimsByUserId = new Map<string, FantasyWaiverClaimRecord[]>();

  pendingClaims.forEach((claim) => {
    const queue = claimsByUserId.get(claim.user_id) ?? [];
    queue.push(claim);
    claimsByUserId.set(claim.user_id, queue);
  });

  while ([...claimsByUserId.values()].some((claims) => claims.length > 0)) {
    const nextMembership = sortMembershipsForWaivers(currentMemberships).find((membership) => {
      return (claimsByUserId.get(membership.user_id) ?? []).length > 0;
    });

    if (!nextMembership) {
      break;
    }

    const queue = claimsByUserId.get(nextMembership.user_id) ?? [];
    const claim = queue.shift();

    if (!claim) {
      claimsByUserId.delete(nextMembership.user_id);
      continue;
    }

    const requestedPlayer = getFantasyPlayerById(claim.requested_player_id);
    const currentRosteredPlayerIds = new Set(rosterSlots.map((slot) => slot.player_id));
    const userRoster = rosterSlots.filter((slot) => slot.user_id === claim.user_id);
    const dropSlot = claim.drop_roster_slot_id
      ? userRoster.find((slot) => slot.id === claim.drop_roster_slot_id)
      : null;

    if (!requestedPlayer) {
      await updateWaiverClaimRecord(claim.id, {
        status: "lost",
        resolution_note: "Requested player is not in the active player pool.",
        processed_at: new Date().toISOString(),
      });
      continue;
    }

    if (
      currentRosteredPlayerIds.has(requestedPlayer.id) ||
      blockedReleasedPlayerIds.has(requestedPlayer.id)
    ) {
      await updateWaiverClaimRecord(claim.id, {
        status: "lost",
        resolution_note: "Another manager secured that player first.",
        processed_at: new Date().toISOString(),
      });
      continue;
    }

    if (userRoster.length >= 12 && !dropSlot) {
      await updateWaiverClaimRecord(claim.id, {
        status: "lost",
        resolution_note: "Roster was full and no valid drop candidate was attached.",
        processed_at: new Date().toISOString(),
      });
      continue;
    }

    if (claim.drop_roster_slot_id && !dropSlot) {
      await updateWaiverClaimRecord(claim.id, {
        status: "lost",
        resolution_note: "Drop candidate was no longer on the roster at processing time.",
        processed_at: new Date().toISOString(),
      });
      continue;
    }

    if (dropSlot) {
      const { error: deleteError } = await supabase
        .from("fantasy_roster_slots")
        .delete()
        .eq("id", dropSlot.id);

      if (deleteError) {
        throw new Error(assertErrorMessage(deleteError, "Unable to drop the outgoing player."));
      }

      blockedReleasedPlayerIds.add(dropSlot.player_id);
      rosterSlots = rosterSlots.filter((slot) => slot.id !== dropSlot.id);
    }

    const { data: insertedRosterSlot, error: rosterInsertError } = await supabase
      .from("fantasy_roster_slots")
      .insert({
        league_id: leagueId,
        user_id: claim.user_id,
        player_id: requestedPlayer.id,
        player_name: requestedPlayer.display_name,
        player_position: requestedPlayer.position,
        club_name: requestedPlayer.club_name,
        acquisition_source: "waiver",
        updated_at: new Date().toISOString(),
      })
      .select("id, league_id, user_id, player_id, player_name, player_position, club_name, acquisition_source, lineup_slot, acquired_at, updated_at")
      .single();

    if (rosterInsertError) {
      throw new Error(assertErrorMessage(rosterInsertError, "Unable to add the winning waiver player."));
    }

    rosterSlots.push(insertedRosterSlot as FantasyRosterSlotRecord);

    await insertTransactionRecords([
      ...(dropSlot
        ? [{
            league_id: leagueId,
            user_id: claim.user_id,
            type: "drop" as const,
            status: "processed" as const,
            player_id: dropSlot.player_id,
            player_name: dropSlot.player_name,
            player_position: dropSlot.player_position,
            club_name: dropSlot.club_name,
            related_waiver_claim_id: claim.id,
            note: `Dropped to complete the claim for ${requestedPlayer.display_name}.`,
            processed_at: new Date().toISOString(),
          }]
        : []),
      {
        league_id: leagueId,
        user_id: claim.user_id,
        type: "waiver_add",
        status: "processed",
        player_id: requestedPlayer.id,
        player_name: requestedPlayer.display_name,
        player_position: requestedPlayer.position,
        club_name: requestedPlayer.club_name,
        related_waiver_claim_id: claim.id,
        dropped_player_id: dropSlot?.player_id ?? null,
        dropped_player_name: dropSlot?.player_name ?? null,
        dropped_player_position: dropSlot?.player_position ?? null,
        dropped_club_name: dropSlot?.club_name ?? null,
        note: `Won on priority ${nextMembership.waiver_priority ?? claim.priority_at_submission}.`,
        processed_at: new Date().toISOString(),
      },
    ]);

    await updateWaiverClaimRecord(claim.id, {
      status: "won",
      resolution_note: "Claim processed successfully.",
      processed_at: new Date().toISOString(),
    });

    for (const queuedClaim of queue) {
      await updateWaiverClaimRecord(queuedClaim.id, {
        status: "lost",
        resolution_note: "Higher-priority claim from the same manager already won this run.",
        processed_at: new Date().toISOString(),
      });
    }

    claimsByUserId.delete(nextMembership.user_id);
    currentMemberships = rotateWaiverPriorityAfterWin(currentMemberships, nextMembership.user_id);
    await updateMembershipWaiverPriorities(leagueId, currentMemberships);
  }

  return loadTransactionHub(leagueId);
}

export async function joinHostedLeagueByCode(codeInput: string) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const profile = await fetchCurrentProfile();

  if (!profile) {
    throw new Error("Create a hosted profile before joining a league.");
  }

  const code = codeInput.trim().toUpperCase();
  const { data: league, error: leagueError } = await supabase
    .from("fantasy_leagues")
    .select("id, code, manager_count_target")
    .eq("code", code)
    .maybeSingle();

  if (leagueError) {
    throw new Error(assertErrorMessage(leagueError, "Unable to look up that league."));
  }

  if (!league) {
    throw new Error("That league code does not exist.");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("fantasy_league_memberships")
    .select("user_id")
    .eq("league_id", league.id);

  if (membershipsError) {
    throw new Error(assertErrorMessage(membershipsError, "Unable to load current league members."));
  }

  const isExistingMember = (memberships ?? []).some(
    (membership) => membership.user_id === user.id
  );

  if (isExistingMember) {
    return {
      code: league.code as string,
      id: league.id as string,
    };
  }

  if ((memberships ?? []).length >= (league.manager_count_target as number)) {
    throw new Error("That league is already full.");
  }

  const { error: insertError } = await supabase
    .from("fantasy_league_memberships")
    .insert({
      display_name: profile.display_name,
      league_id: league.id,
      role: "manager",
      team_name: `${profile.display_name} FC`,
      user_id: user.id,
    });

  if (insertError) {
    throw new Error(assertErrorMessage(insertError, "Unable to join that league."));
  }

  return {
    code: league.code as string,
    id: league.id as string,
  };
}

export async function loadDraftState(leagueId: string) {
  const { user, league, memberships, myMembership } = await fetchLeagueContext(leagueId);
  const draft = await ensureDraftRecord(leagueId, league.commissioner_user_id, user.id);
  const picks = await fetchDraftPicks(leagueId);
  const queue = await fetchQueueForUser(leagueId, user.id);
  const myRoster = hydrateRosterPlayers(await fetchRosterForUser(leagueId, user.id));
  const currentTurn = buildSnakeTurn(
    sortMembershipsForDraft(memberships),
    picks.length + 1,
    draft.total_rounds
  );

  return {
    league,
    draft,
    memberships: sortMembershipsForDraft(memberships),
    picks,
    queue,
    myRoster,
    availablePlayers: buildAvailablePlayers(picks),
    myMembership,
    currentTurn,
    isMyTurn:
      draft.status === "live" && currentTurn?.membership?.user_id === user.id,
    canCommissionerControl: league.commissioner_user_id === user.id,
  } satisfies FantasyDraftState;
}

export async function revealDraftOrder(leagueId: string) {
  const { user, league, memberships } = await fetchLeagueContext(leagueId);

  if (league.commissioner_user_id !== user.id) {
    throw new Error("Only the commissioner can reveal the draft order.");
  }

  const picks = await fetchDraftPicks(leagueId);

  if (picks.length > 0) {
    throw new Error("The draft order cannot change after picks have started.");
  }

  if (!memberships.every((membership) => membership.draft_slot != null)) {
    await assignDraftOrderForLeague(leagueId, memberships);
  }

  await ensureDraftRecord(leagueId, league.commissioner_user_id, user.id);
  await updateDraftRow(leagueId, {
    status: "lobby",
    order_revealed_at: new Date().toISOString(),
  });

  return loadDraftState(leagueId);
}

export async function updateDraftStatus(
  leagueId: string,
  status: FantasyDraftRecord["status"]
) {
  const { user, league, memberships } = await fetchLeagueContext(leagueId);

  if (league.commissioner_user_id !== user.id) {
    throw new Error("Only the commissioner can change draft status.");
  }

  const draft = await ensureDraftRecord(leagueId, league.commissioner_user_id, user.id);

  if (status === "live" && !memberships.every((membership) => membership.draft_slot != null)) {
    throw new Error("Reveal the draft order before starting the room.");
  }

  if (status === "live") {
    await updateDraftRow(leagueId, {
      status,
      started_at: draft.started_at ?? new Date().toISOString(),
      paused_at: null,
      current_pick_started_at: new Date().toISOString(),
      order_revealed_at: draft.order_revealed_at ?? new Date().toISOString(),
    });
    await syncLeagueStatus(leagueId, "live");
  } else if (status === "paused") {
    await updateDraftRow(leagueId, {
      status,
      paused_at: new Date().toISOString(),
      current_pick_started_at: null,
    });
  } else {
    await updateDraftRow(leagueId, { status });
  }

  return loadDraftState(leagueId);
}

export async function makeDraftPick(leagueId: string, playerId: string) {
  const user = await requireUser();
  const player = getFantasyPlayerById(playerId);

  if (!player) {
    throw new Error("That player is not in the launch draft pool.");
  }

  await recordDraftPick(leagueId, player, "manual", user.id);
  return loadDraftState(leagueId);
}

export async function autopickCurrentDraftTurn(leagueId: string) {
  const { user, league } = await fetchLeagueContext(leagueId);
  const draftState = await loadDraftState(leagueId);

  if (!draftState.currentTurn?.membership) {
    throw new Error("That draft is already complete.");
  }

  const actorIsCommissioner = league.commissioner_user_id === user.id;
  const actorIsCurrentManager = draftState.currentTurn.membership.user_id === user.id;

  if (!actorIsCommissioner && !actorIsCurrentManager) {
    throw new Error("Only the active manager or commissioner can trigger autopick.");
  }

  const queueItems = await fetchQueueForUser(
    leagueId,
    draftState.currentTurn.membership.user_id
  );
  const queuePlayers = queueItems
    .map((item) => getFantasyPlayerById(item.player_id))
    .filter((player): player is FantasyPoolPlayer => player != null);
  const managerRoster = hydrateRosterPlayers(
    await fetchRosterForUser(leagueId, draftState.currentTurn.membership.user_id)
  );
  const player = chooseAutopickPlayer(
    draftState.availablePlayers,
    managerRoster,
    queuePlayers
  );

  if (!player) {
    throw new Error("No legal player is available for autopick.");
  }

  await recordDraftPick(
    leagueId,
    player,
    queuePlayers.some((queuedPlayer) => queuedPlayer.id === player.id) ? "queue" : "autopick",
    user.id
  );

  return loadDraftState(leagueId);
}

export async function addPlayerToDraftQueue(leagueId: string, playerId: string) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const player = getFantasyPlayerById(playerId);

  if (!player) {
    throw new Error("That player is not in the launch draft pool.");
  }

  const queue = await fetchQueueForUser(leagueId, user.id);
  const existingItem = queue.find((item) => item.player_id === player.id);

  if (existingItem) {
    return queue;
  }

  const { error } = await supabase.from("fantasy_draft_queue_items").insert({
    league_id: leagueId,
    user_id: user.id,
    player_id: player.id,
    player_name: player.display_name,
    player_position: player.position,
    club_name: player.club_name,
    priority: queue.length + 1,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to add that player to the queue."));
  }

  return fetchQueueForUser(leagueId, user.id);
}

export async function moveDraftQueueItem(
  leagueId: string,
  playerId: string,
  direction: "up" | "down"
) {
  const user = await requireUser();
  const queue = await fetchQueueForUser(leagueId, user.id);
  const currentIndex = queue.findIndex((item) => item.player_id === playerId);

  if (currentIndex === -1) {
    return queue;
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (nextIndex < 0 || nextIndex >= queue.length) {
    return queue;
  }

  const reorderedQueue = [...queue];
  const current = reorderedQueue[currentIndex];
  reorderedQueue[currentIndex] = reorderedQueue[nextIndex];
  reorderedQueue[nextIndex] = current;

  await renumberQueueItems(leagueId, user.id, reorderedQueue);
  return fetchQueueForUser(leagueId, user.id);
}

export async function removePlayerFromDraftQueue(leagueId: string, playerId: string) {
  const supabase = getSupabaseBrowserClient();
  const user = await requireUser();
  const { error } = await supabase
    .from("fantasy_draft_queue_items")
    .delete()
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .eq("player_id", playerId);

  if (error) {
    throw new Error(assertErrorMessage(error, "Unable to remove that player from the queue."));
  }

  const queue = await fetchQueueForUser(leagueId, user.id);
  await renumberQueueItems(leagueId, user.id, queue);
  return fetchQueueForUser(leagueId, user.id);
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
