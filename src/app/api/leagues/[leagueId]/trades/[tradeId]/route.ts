import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  unauthorized,
  notFound,
  forbidden,
  badRequest,
  requireMembership,
} from "@/lib/api-helpers";

type RouteParams = { params: Promise<{ leagueId: string; tradeId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId, tradeId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { action } = body;
  if (!action || !["accept", "reject", "cancel"].includes(action)) {
    return badRequest("action must be one of: accept, reject, cancel");
  }

  const trade = await prisma.tradeProposal.findUnique({
    where: { id: tradeId },
    include: { assets: true },
  });

  if (!trade || trade.leagueId !== leagueId) {
    return notFound("Trade not found");
  }

  if (trade.status !== "PENDING") {
    return badRequest("Trade is no longer pending");
  }

  if (action === "cancel") {
    if (trade.proposerTeamId !== membership.team.id) {
      return forbidden("Only the proposing team can cancel a trade");
    }
    const updated = await prisma.tradeProposal.update({
      where: { id: tradeId },
      data: { status: "CANCELED", respondedAt: new Date() },
    });
    return NextResponse.json({ trade: updated });
  }

  if (action === "reject") {
    if (trade.receiverTeamId !== membership.team.id) {
      return forbidden("Only the receiving team can reject a trade");
    }
    const updated = await prisma.tradeProposal.update({
      where: { id: tradeId },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
    return NextResponse.json({ trade: updated });
  }

  // action === "accept"
  if (trade.receiverTeamId !== membership.team.id) {
    return forbidden("Only the receiving team can accept a trade");
  }

  // Process the trade: swap roster spots
  const updated = await prisma.$transaction(async (tx) => {
    const proposerAssets = trade.assets.filter(
      (a) => a.fromTeamId === trade.proposerTeamId
    );
    const receiverAssets = trade.assets.filter(
      (a) => a.fromTeamId === trade.receiverTeamId
    );

    // Release offered players from proposer, add to receiver
    for (const asset of proposerAssets) {
      await tx.rosterSpot.updateMany({
        where: {
          fantasyTeamId: trade.proposerTeamId,
          playerId: asset.playerId,
          releasedAt: null,
        },
        data: { releasedAt: new Date() },
      });
      await tx.rosterSpot.create({
        data: {
          fantasyTeamId: trade.receiverTeamId,
          playerId: asset.playerId,
          acquisitionType: "FREE_AGENT_ADD", // Closest available type for trade
        },
      });
    }

    // Release requested players from receiver, add to proposer
    for (const asset of receiverAssets) {
      await tx.rosterSpot.updateMany({
        where: {
          fantasyTeamId: trade.receiverTeamId,
          playerId: asset.playerId,
          releasedAt: null,
        },
        data: { releasedAt: new Date() },
      });
      await tx.rosterSpot.create({
        data: {
          fantasyTeamId: trade.proposerTeamId,
          playerId: asset.playerId,
          acquisitionType: "FREE_AGENT_ADD",
        },
      });
    }

    return tx.tradeProposal.update({
      where: { id: tradeId },
      data: {
        status: "ACCEPTED",
        respondedAt: new Date(),
        processedAt: new Date(),
      },
    });
  });

  return NextResponse.json({ trade: updated });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId, tradeId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  let body: { decision?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { decision } = body;
  if (!decision || !["APPROVE", "VETO"].includes(decision)) {
    return badRequest("decision must be APPROVE or VETO");
  }

  const trade = await prisma.tradeProposal.findUnique({
    where: { id: tradeId },
  });

  if (!trade || trade.leagueId !== leagueId) {
    return notFound("Trade not found");
  }

  if (trade.status !== "ACCEPTED") {
    return badRequest("Trade is not in the review period");
  }

  // Cannot vote on your own trade
  if (
    trade.proposerTeamId === membership.team.id ||
    trade.receiverTeamId === membership.team.id
  ) {
    return forbidden("Involved teams cannot vote on their own trade");
  }

  const vote = await prisma.tradeVote.upsert({
    where: {
      tradeProposalId_fantasyTeamId: {
        tradeProposalId: tradeId,
        fantasyTeamId: membership.team.id,
      },
    },
    update: { decision: decision as "APPROVE" | "VETO" },
    create: {
      tradeProposalId: tradeId,
      fantasyTeamId: membership.team.id,
      userId: user.id,
      decision: decision as "APPROVE" | "VETO",
    },
  });

  // Check if veto threshold reached
  if (decision === "VETO") {
    const vetoCount = await prisma.tradeVote.count({
      where: { tradeProposalId: tradeId, decision: "VETO" },
    });

    if (vetoCount >= trade.vetoThreshold) {
      await prisma.tradeProposal.update({
        where: { id: tradeId },
        data: { status: "VETOED", vetoCount },
      });
    }
  }

  return NextResponse.json({ vote });
}
