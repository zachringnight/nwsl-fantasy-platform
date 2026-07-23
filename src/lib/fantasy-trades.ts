"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queueNotification } from "@/lib/notifications/client";
import { awardAchievement } from "@/lib/fantasy-achievements";
import type { TradeProposalRecord, TradeProposalStatus } from "@/types/fantasy";

interface CreateTradeInput {
  leagueId: string;
  proposerTeamId: string;
  receiverTeamId: string;
  message?: string;
  sendingPlayerIds: string[];
  receivingPlayerIds: string[];
  reviewHours?: number;
}

export async function loadTradeProposals(
  leagueId: string,
  statuses?: TradeProposalStatus[]
): Promise<TradeProposalRecord[]> {
  const supabase = getSupabaseBrowserClient();

  let query = supabase
    .from("fantasy_trade_proposals")
    .select(`
      id,
      league_id,
      proposer_team_id,
      receiver_team_id,
      status,
      message,
      review_period_ends_at,
      veto_count,
      veto_threshold,
      created_at,
      proposer_team:fantasy_league_memberships!fantasy_trade_proposals_proposer_team_id_fkey ( team_name ),
      receiver_team:fantasy_league_memberships!fantasy_trade_proposals_receiver_team_id_fkey ( team_name ),
      assets:fantasy_trade_assets ( id, trade_proposal_id, from_team_id, player_id, player_name, player_position, club_name ),
      votes:fantasy_trade_votes ( id, trade_proposal_id, fantasy_team_id, user_id, decision, created_at )
    `)
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;

  if (error) return [];

  const rawRows = (data ?? []) as Array<Record<string, unknown>>;
  const expiredIds = rawRows
    .filter(
      (row) =>
        row.status === "pending" &&
        new Date(row.review_period_ends_at as string).getTime() <= Date.now()
    )
    .map((row) => row.id as string);

  if (expiredIds.length > 0) {
    await supabase
      .from("fantasy_trade_proposals")
      .update({
        status: "expired",
        processed_at: new Date().toISOString(),
      })
      .in("id", expiredIds);
  }
  const expiredSet = new Set(expiredIds);

  return rawRows.map((row) => ({
    id: row.id as string,
    league_id: row.league_id as string,
    proposer_team_id: row.proposer_team_id as string,
    proposer_team_name: ((row.proposer_team as Record<string, string>)?.team_name) ?? "Unknown",
    receiver_team_id: row.receiver_team_id as string,
    receiver_team_name: ((row.receiver_team as Record<string, string>)?.team_name) ?? "Unknown",
    status: (expiredSet.has(row.id as string)
      ? "expired"
      : row.status) as TradeProposalStatus,
    message: row.message as string | null,
    review_period_ends_at: row.review_period_ends_at as string,
    veto_count: row.veto_count as number,
    veto_threshold: row.veto_threshold as number,
    assets: row.assets as TradeProposalRecord["assets"],
    votes: row.votes as TradeProposalRecord["votes"],
    created_at: row.created_at as string,
  }));
}

export async function createTradeProposal(input: CreateTradeInput): Promise<TradeProposalRecord> {
  const supabase = getSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to propose a trade.");

  if (input.sendingPlayerIds.length === 0 || input.receivingPlayerIds.length === 0) {
    throw new Error("Both sides of the trade must include at least one player.");
  }

  // Count league members for veto threshold (majority minus trading teams)
  const { count } = await supabase
    .from("fantasy_league_memberships")
    .select("id", { count: "exact", head: true })
    .eq("league_id", input.leagueId);

  const memberCount = count ?? 0;
  const vetoThreshold = Math.max(1, Math.ceil((memberCount - 2) / 2));
  const reviewHours = input.reviewHours ?? 24;
  const reviewEnd = new Date(Date.now() + reviewHours * 60 * 60 * 1000).toISOString();

  const { data: proposal, error: proposalError } = await supabase
    .from("fantasy_trade_proposals")
    .insert({
      league_id: input.leagueId,
      proposer_team_id: input.proposerTeamId,
      receiver_team_id: input.receiverTeamId,
      status: "pending",
      message: input.message ?? null,
      review_period_ends_at: reviewEnd,
      veto_threshold: vetoThreshold,
    })
    .select("id, league_id, proposer_team_id, receiver_team_id, status, message, review_period_ends_at, veto_count, veto_threshold, created_at")
    .single();

  if (proposalError) throw new Error("Unable to create trade proposal.");

  // Fetch player details for the assets
  const allPlayerIds = [...input.sendingPlayerIds, ...input.receivingPlayerIds];
  const { data: players } = await supabase
    .from("fantasy_roster_slots")
    .select("player_id, player_name, player_position, club_name, user_id")
    .in("player_id", allPlayerIds)
    .eq("league_id", input.leagueId);

  const playerMap = new Map((players ?? []).map((p) => [p.player_id, p]));

  const assets = [
    ...input.sendingPlayerIds.map((playerId) => {
      const player = playerMap.get(playerId);
      return {
        trade_proposal_id: proposal.id,
        from_team_id: input.proposerTeamId,
        player_id: playerId,
        player_name: player?.player_name ?? "Unknown",
        player_position: player?.player_position ?? "MID",
        club_name: player?.club_name ?? "Unknown",
      };
    }),
    ...input.receivingPlayerIds.map((playerId) => {
      const player = playerMap.get(playerId);
      return {
        trade_proposal_id: proposal.id,
        from_team_id: input.receiverTeamId,
        player_id: playerId,
        player_name: player?.player_name ?? "Unknown",
        player_position: player?.player_position ?? "MID",
        club_name: player?.club_name ?? "Unknown",
      };
    }),
  ];

  const { data: insertedAssets, error: assetError } = await supabase
    .from("fantasy_trade_assets")
    .insert(assets)
    .select("id, trade_proposal_id, from_team_id, player_id, player_name, player_position, club_name");

  if (assetError) throw new Error("Unable to create trade assets.");

  const { data: receiver } = await supabase
    .from("fantasy_league_memberships")
    .select("user_id, team_name")
    .eq("id", input.receiverTeamId)
    .maybeSingle();

  if (receiver?.user_id) {
    void queueNotification({
      userId: receiver.user_id,
      leagueId: input.leagueId,
      type: "TRADE_PROPOSED",
      title: "New trade proposal",
      body: `A manager sent ${receiver.team_name ?? "your team"} a trade proposal.`,
      channels: ["in_app"],
    }).catch(() => undefined);
  }

  return {
    ...proposal,
    proposer_team_name: "",
    receiver_team_name: "",
    assets: insertedAssets as TradeProposalRecord["assets"],
    votes: [],
  } as TradeProposalRecord;
}

export async function respondToTrade(
  proposalId: string,
  decision: "accepted" | "rejected"
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: proposal } = await supabase
    .from("fantasy_trade_proposals")
    .select("league_id, proposer_team_id, receiver_team_id")
    .eq("id", proposalId)
    .maybeSingle();

  const { error } = await supabase
    .from("fantasy_trade_proposals")
    .update({
      status: decision,
      responded_at: new Date().toISOString(),
      processed_at: decision === "accepted" ? new Date().toISOString() : null,
    })
    .eq("id", proposalId)
    .eq("status", "pending");

  if (error) throw new Error("Unable to respond to trade.");

  if (proposal?.proposer_team_id) {
    const { data: tradeTeams } = await supabase
      .from("fantasy_league_memberships")
      .select("id, user_id")
      .in("id", [proposal.proposer_team_id, proposal.receiver_team_id]);
    const proposer = tradeTeams?.find(
      (team) => team.id === proposal.proposer_team_id
    );
    const receiver = tradeTeams?.find(
      (team) => team.id === proposal.receiver_team_id
    );

    if (proposer?.user_id) {
      void queueNotification({
        userId: proposer.user_id,
        leagueId: proposal.league_id,
        type: "TRADE_RESPONDED",
        title: `Trade ${decision}`,
        body: `Your trade proposal was ${decision}.`,
        channels: ["in_app"],
      }).catch(() => undefined);
    }

    if (decision === "accepted") {
      await Promise.allSettled(
        [proposer?.user_id, receiver?.user_id]
          .filter((userId): userId is string => Boolean(userId))
          .map((userId) =>
            awardAchievement(userId, "TRADE_PARTNER", proposal.league_id, {
              proposalId,
            })
          )
      );
    }
  }
}

export async function voteOnTrade(
  proposalId: string,
  fantasyTeamId: string,
  decision: "approve" | "veto"
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to vote.");

  const { error: voteError } = await supabase
    .from("fantasy_trade_votes")
    .upsert(
      {
        trade_proposal_id: proposalId,
        fantasy_team_id: fantasyTeamId,
        user_id: user.id,
        decision,
      },
      { onConflict: "trade_proposal_id,fantasy_team_id" }
    );

  if (voteError) throw new Error("Unable to cast vote.");

  if (decision === "veto") {
    // Increment veto count and check threshold
    const { data: proposal } = await supabase
      .from("fantasy_trade_proposals")
      .select("veto_count, veto_threshold")
      .eq("id", proposalId)
      .single();

    if (proposal) {
      const newCount = (proposal.veto_count ?? 0) + 1;
      const update: Record<string, unknown> = { veto_count: newCount };

      if (newCount >= proposal.veto_threshold) {
        update.status = "vetoed";
        update.processed_at = new Date().toISOString();
      }

      await supabase
        .from("fantasy_trade_proposals")
        .update(update)
        .eq("id", proposalId);
    }
  }
}

export async function cancelTrade(proposalId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase
    .from("fantasy_trade_proposals")
    .update({
      status: "canceled",
      processed_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .eq("status", "pending");

  if (error) throw new Error("Unable to cancel trade.");
}
