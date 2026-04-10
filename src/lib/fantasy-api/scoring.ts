"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildSalaryCapAutofillSelections,
  buildSalaryCapEntrySummary,
  buildSalaryCapEntryWindowState,
  isPlayerEligibleForSalaryCapSlot,
  isSalaryCapEntryLocked,
  salaryCapLineupSlots,
} from "@/lib/fantasy-salary-cap";
import {
  getFantasyModeConfig,
} from "@/lib/fantasy-modes";
import {
  getFantasySlateWindows,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import {
  getFantasyPlayerById,
  getFantasyPlayerPool,
} from "@/lib/fantasy-player-pool";
import type {
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyPoolPlayer,
  FantasySalaryCapEntryRecord,
  FantasySalaryCapEntrySlotRecord,
  FantasySalaryCapEntryState,
  FantasySalaryCapLineupSlot,
  FantasySlateWindow,
} from "@/types/fantasy";
import {
  assertErrorMessage,
  assertSalaryCapLeagueMode,
  fetchLeagueContext,
} from "./shared";

function buildFantasyPlayerMap(players: FantasyPoolPlayer[]) {
  return new Map(players.map((player) => [player.id, player] as const));
}

async function fetchMaterializedProjectionPool(
  variant: FantasyLeagueRecord["game_variant"],
  slateKey?: string
) {
  const searchParams = new URLSearchParams({
    schemaKey: "site_launch_v1",
    variant,
  });

  if (slateKey) {
    searchParams.set("slateKey", slateKey);
  }

  const response = await fetch(`/api/fantasy-projections?${searchParams.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to load the projected salary-cap player pool.");
  }

  const payload = (await response.json()) as {
    players?: FantasyPoolPlayer[];
  };

  return payload.players ?? [];
}

async function loadSalaryCapAvailablePlayers(
  league: FantasyLeagueRecord,
  slateKey?: string
) {
  try {
    const projections = await fetchMaterializedProjectionPool(
      league.game_variant,
      slateKey
    );

    if (projections.length > 0) {
      return projections;
    }
  } catch (error) {
    console.warn("[salary-cap] Falling back to bootstrap fantasy pool.", error);
  }

  return getFantasyPlayerPool();
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
  slotRecords: FantasySalaryCapEntrySlotRecord[],
  availablePlayers: FantasyPoolPlayer[]
) {
  const slotRecordBySlot = new Map(
    slotRecords.map((slotRecord) => [slotRecord.lineup_slot, slotRecord] as const)
  );
  const availablePlayerById = buildFantasyPlayerMap(availablePlayers);
  const slots = salaryCapLineupSlots.map((lineupSlot) => {
    const record = slotRecordBySlot.get(lineupSlot) ?? null;
    const selectedPlayer = record
      ? availablePlayerById.get(record.player_id) ?? getFantasyPlayerById(record.player_id)
      : null;

    return {
      lineup_slot: lineupSlot,
      player: selectedPlayer,
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
    available_players: availablePlayers,
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
  availablePlayers: FantasyPoolPlayer[],
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
  const availablePlayerById = buildFantasyPlayerMap(availablePlayers);
  const selectedPlayers: Array<{
    lineupSlot: FantasySalaryCapLineupSlot;
    player: FantasyPoolPlayer;
  }> = [];

  normalizedAssignments.forEach((assignment) => {
    if (!assignment.playerId) {
      return;
    }

    const player = availablePlayerById.get(assignment.playerId);

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
      player: assignment.playerId
        ? availablePlayerById.get(assignment.playerId) ?? null
        : null,
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
  const availablePlayers = await loadSalaryCapAvailablePlayers(league, activeSlate.key);
  const entry = await ensureSalaryCapEntry(leagueId, user.id, myMembership, activeSlate);
  const slotRecords = await fetchSalaryCapEntrySlots(entry.id);

  return buildSalaryCapEntryState(
    league,
    myMembership,
    activeSlate,
    availableSlates,
    entry,
    slotRecords,
    availablePlayers
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
  const availablePlayers = await loadSalaryCapAvailablePlayers(league, slate.key);

  if (existingEntry.status === "submitted") {
    throw new Error("Reopen the submitted entry before saving changes.");
  }

  const { selectedPlayers, summary } = validateSalaryCapAssignments(
    league,
    availablePlayers,
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
  const availablePlayers = await loadSalaryCapAvailablePlayers(league, slate.key);
  const { selectedPlayers, summary } = validateSalaryCapAssignments(
    league,
    availablePlayers,
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
