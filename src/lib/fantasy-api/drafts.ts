"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildSnakeTurn,
  chooseAutopickPlayer,
  validateDraftPick,
} from "@/lib/fantasy-draft";
import {
  getFantasyPlayerById,
} from "@/lib/fantasy-player-pool";
import type {
  FantasyDraftPickRecord,
  FantasyDraftRecord,
  FantasyDraftState,
  FantasyPoolPlayer,
} from "@/types/fantasy";
import {
  assertErrorMessage,
  assignDraftOrderForLeague,
  buildAvailablePlayers,
  ensureDraftRecord,
  fetchDraftPicks,
  fetchLeagueContext,
  fetchQueueForUser,
  fetchRosterForUser,
  hydrateRosterPlayers,
  renumberQueueItems,
  requireUser,
  sortMembershipsForDraft,
  syncLeagueStatus,
  updateDraftRow,
} from "./shared";

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
