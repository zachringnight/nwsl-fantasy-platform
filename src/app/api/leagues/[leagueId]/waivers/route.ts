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
  if (!membership.team) return notFound("No team found");

  const claims = await prisma.waiverClaim.findMany({
    where: {
      leagueId,
      fantasyTeamId: membership.team.id,
      status: "PENDING",
    },
    include: {
      requestedPlayer: {
        select: { id: true, displayName: true, primaryPosition: true },
      },
      dropPlayer: {
        select: { id: true, displayName: true, primaryPosition: true },
      },
      processingWeek: { select: { id: true, sequence: true, label: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ claims });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  let body: { requestedPlayerId?: string; dropPlayerId?: string; bidAmount?: number };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { requestedPlayerId, dropPlayerId, bidAmount } = body;

  if (!requestedPlayerId || typeof requestedPlayerId !== "string") {
    return badRequest("requestedPlayerId is required");
  }

  // Validate requested player exists and is not rostered in this league
  const requestedPlayer = await prisma.player.findUnique({
    where: { id: requestedPlayerId },
  });
  if (!requestedPlayer) return notFound("Requested player not found");

  const onRoster = await prisma.rosterSpot.findFirst({
    where: {
      playerId: requestedPlayerId,
      releasedAt: null,
      fantasyTeam: { leagueId },
    },
  });
  if (onRoster) return badRequest("Player is already rostered in this league");

  // Validate drop player if provided
  if (dropPlayerId) {
    const dropRoster = await prisma.rosterSpot.findFirst({
      where: {
        fantasyTeamId: membership.team.id,
        playerId: dropPlayerId,
        releasedAt: null,
      },
    });
    if (!dropRoster) return badRequest("Drop player is not on your roster");
  }

  // Find the current or next upcoming week for processing
  const processingWeek = await prisma.leagueWeek.findFirst({
    where: { leagueId, status: { in: ["UPCOMING", "LIVE"] } },
    orderBy: { sequence: "asc" },
  });

  if (!processingWeek) return badRequest("No active week available for waiver processing");

  // Determine waiver priority
  const waiverPriority = membership.team.waiverPriority ?? 999;

  const claim = await prisma.waiverClaim.create({
    data: {
      leagueId,
      fantasyTeamId: membership.team.id,
      requestedPlayerId,
      dropPlayerId: dropPlayerId || null,
      processingWeekId: processingWeek.id,
      priorityAtSubmission: waiverPriority,
      bidAmount: bidAmount ?? null,
    },
    include: {
      requestedPlayer: {
        select: { id: true, displayName: true, primaryPosition: true },
      },
      dropPlayer: {
        select: { id: true, displayName: true, primaryPosition: true },
      },
    },
  });

  return NextResponse.json({ claim }, { status: 201 });
}
