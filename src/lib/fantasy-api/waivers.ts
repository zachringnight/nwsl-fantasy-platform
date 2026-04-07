"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getFantasyPlayerById,
} from "@/lib/fantasy-player-pool";
import type {
  FantasyLeagueMembershipRecord,
  FantasyRosterSlotRecord,
  FantasyTransactionHubState,
  FantasyTransactionRecord,
  FantasyWaiverClaimRecord,
} from "@/types/fantasy";
import {
  assertClassicLeagueMode,
  assertErrorMessage,
  buildClaimablePlayers,
  fetchLeagueContext,
  fetchRosterForUser,
  fetchRostersForLeague,
  hydrateRosterPlayers,
  type PrioritizedMembership,
} from "./shared";

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

  const results = await Promise.all(
    memberships.map((membership) =>
      supabase
        .from("fantasy_league_memberships")
        .update({ waiver_priority: membership.waiver_priority })
        .eq("id", membership.id)
        .eq("league_id", leagueId)
    )
  );

  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    throw new Error(assertErrorMessage(firstError.error, "Unable to update waiver priority."));
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

    if (queue.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        queue.map((queuedClaim) =>
          updateWaiverClaimRecord(queuedClaim.id, {
            status: "lost",
            resolution_note: "Higher-priority claim from the same manager already won this run.",
            processed_at: now,
          })
        )
      );
    }

    claimsByUserId.delete(nextMembership.user_id);
    currentMemberships = rotateWaiverPriorityAfterWin(currentMemberships, nextMembership.user_id);
    await updateMembershipWaiverPriorities(leagueId, currentMemberships);
  }

  return loadTransactionHub(leagueId);
}
