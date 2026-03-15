import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  unauthorized,
  notFound,
  badRequest,
  requireMembership,
} from "@/lib/api-helpers";

type RouteParams = { params: Promise<{ leagueId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const whereClause: Record<string, unknown> = { leagueId };
  if (status) {
    whereClause.status = status;
  }

  const trades = await prisma.tradeProposal.findMany({
    where: whereClause,
    include: {
      proposerTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
          membership: {
            select: { user: { select: { id: true, name: true } } },
          },
        },
      },
      receiverTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
          membership: {
            select: { user: { select: { id: true, name: true } } },
          },
        },
      },
      assets: {
        include: {
          player: {
            select: { id: true, displayName: true, primaryPosition: true, headshotUrl: true },
          },
        },
      },
      _count: { select: { votes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ trades });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  let body: {
    receiverTeamId?: string;
    offeredPlayerIds?: string[];
    requestedPlayerIds?: string[];
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { receiverTeamId, offeredPlayerIds, requestedPlayerIds, message } = body;

  if (!receiverTeamId || typeof receiverTeamId !== "string") {
    return badRequest("receiverTeamId is required");
  }

  if (!offeredPlayerIds?.length || !requestedPlayerIds?.length) {
    return badRequest("Both offeredPlayerIds and requestedPlayerIds must be non-empty arrays");
  }

  if (receiverTeamId === membership.team.id) {
    return badRequest("Cannot trade with yourself");
  }

  // Validate receiver team is in the same league
  const receiverTeam = await prisma.fantasyTeam.findFirst({
    where: { id: receiverTeamId, leagueId },
  });
  if (!receiverTeam) return notFound("Receiver team not found in this league");

  // Validate offered players are on proposer's roster
  const offeredRosterSpots = await prisma.rosterSpot.findMany({
    where: {
      fantasyTeamId: membership.team.id,
      playerId: { in: offeredPlayerIds },
      releasedAt: null,
    },
    include: { player: { include: { club: true } } },
  });

  if (offeredRosterSpots.length !== offeredPlayerIds.length) {
    return badRequest("One or more offered players are not on your roster");
  }

  // Validate requested players are on receiver's roster
  const requestedRosterSpots = await prisma.rosterSpot.findMany({
    where: {
      fantasyTeamId: receiverTeamId,
      playerId: { in: requestedPlayerIds },
      releasedAt: null,
    },
    include: { player: { include: { club: true } } },
  });

  if (requestedRosterSpots.length !== requestedPlayerIds.length) {
    return badRequest("One or more requested players are not on the receiver's roster");
  }

  // Set review period (24 hours after acceptance, for league veto)
  const reviewPeriodEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Get league member count for veto threshold (majority of non-involved teams)
  const memberCount = await prisma.leagueMembership.count({ where: { leagueId } });
  const vetoThreshold = Math.ceil((memberCount - 2) / 2);

  const trade = await prisma.tradeProposal.create({
    data: {
      leagueId,
      proposerTeamId: membership.team.id,
      receiverTeamId,
      message: message?.trim() || null,
      reviewPeriodEndsAt,
      vetoThreshold,
      assets: {
        create: [
          ...offeredRosterSpots.map((rs) => ({
            fromTeamId: membership.team!.id,
            playerId: rs.playerId,
            playerName: rs.player.displayName,
            playerPosition: rs.player.primaryPosition,
            clubName: rs.player.club?.name ?? "Free Agent",
          })),
          ...requestedRosterSpots.map((rs) => ({
            fromTeamId: receiverTeamId,
            playerId: rs.playerId,
            playerName: rs.player.displayName,
            playerPosition: rs.player.primaryPosition,
            clubName: rs.player.club?.name ?? "Free Agent",
          })),
        ],
      },
    },
    include: {
      assets: true,
      proposerTeam: { select: { id: true, name: true } },
      receiverTeam: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ trade }, { status: 201 });
}
