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
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { leagueId },
      include: {
        player: {
          select: { id: true, displayName: true, primaryPosition: true },
        },
        fromTeam: { select: { id: true, name: true, abbreviation: true } },
        toTeam: { select: { id: true, name: true, abbreviation: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where: { leagueId } }),
  ]);

  return NextResponse.json({
    transactions,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  let body: { action?: string; playerId?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { action, playerId } = body;

  if (!action || !["add", "drop"].includes(action)) {
    return badRequest("action must be 'add' or 'drop'");
  }

  if (!playerId || typeof playerId !== "string") {
    return badRequest("playerId is required");
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return notFound("Player not found");

  if (action === "add") {
    // Check player is not on any team in this league
    const onRoster = await prisma.rosterSpot.findFirst({
      where: {
        playerId,
        releasedAt: null,
        fantasyTeam: { leagueId },
      },
    });

    if (onRoster) return badRequest("Player is already rostered in this league");

    // Check roster size limit
    const settings = await prisma.leagueSettings.findUnique({ where: { leagueId } });
    const currentRosterSize = await prisma.rosterSpot.count({
      where: { fantasyTeamId: membership.team.id, releasedAt: null },
    });

    if (settings && currentRosterSize >= settings.rosterSize) {
      return badRequest("Your roster is full. Drop a player first.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const rosterSpot = await tx.rosterSpot.create({
        data: {
          fantasyTeamId: membership.team!.id,
          playerId,
          acquisitionType: "FREE_AGENT_ADD",
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          leagueId,
          fantasyTeamToId: membership.team!.id,
          playerId,
          type: "FREE_AGENT_ADD",
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });

      return { rosterSpot, transaction };
    });

    return NextResponse.json(result, { status: 201 });
  }

  // action === "drop"
  const rosterSpot = await prisma.rosterSpot.findFirst({
    where: {
      fantasyTeamId: membership.team.id,
      playerId,
      releasedAt: null,
    },
  });

  if (!rosterSpot) return badRequest("Player is not on your roster");

  const result = await prisma.$transaction(async (tx) => {
    await tx.rosterSpot.update({
      where: { id: rosterSpot.id },
      data: { releasedAt: new Date() },
    });

    const transaction = await tx.transaction.create({
      data: {
        leagueId,
        fantasyTeamFromId: membership.team!.id,
        playerId,
        type: "DROP",
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });

    return { transaction };
  });

  return NextResponse.json(result, { status: 201 });
}
