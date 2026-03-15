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

  const draft = await prisma.draft.findUnique({ where: { leagueId } });
  if (!draft) return notFound("Draft not found");

  const queue = await prisma.draftQueueItem.findMany({
    where: { draftId: draft.id, fantasyTeamId: membership.team.id },
    include: {
      player: {
        select: {
          id: true,
          displayName: true,
          primaryPosition: true,
          headshotUrl: true,
          club: { select: { id: true, name: true, abbreviation: true } },
        },
      },
    },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({ queue });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  let body: { players?: Array<{ playerId: string; position: number }> };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { players } = body;
  if (!players || !Array.isArray(players)) {
    return badRequest("players array is required");
  }

  const draft = await prisma.draft.findUnique({ where: { leagueId } });
  if (!draft) return notFound("Draft not found");

  // Validate all player IDs exist
  const playerIds = players.map((p) => p.playerId);
  const uniqueIds = new Set(playerIds);
  if (uniqueIds.size !== playerIds.length) {
    return badRequest("Duplicate player IDs in queue");
  }

  const existingPlayers = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true },
  });

  if (existingPlayers.length !== playerIds.length) {
    return badRequest("One or more player IDs are invalid");
  }

  // Replace the entire queue
  await prisma.$transaction(async (tx) => {
    await tx.draftQueueItem.deleteMany({
      where: { draftId: draft.id, fantasyTeamId: membership.team!.id },
    });

    if (players.length > 0) {
      await tx.draftQueueItem.createMany({
        data: players.map((p) => ({
          draftId: draft.id,
          fantasyTeamId: membership.team!.id,
          playerId: p.playerId,
          position: p.position,
        })),
      });
    }
  });

  const updatedQueue = await prisma.draftQueueItem.findMany({
    where: { draftId: draft.id, fantasyTeamId: membership.team.id },
    include: {
      player: {
        select: {
          id: true,
          displayName: true,
          primaryPosition: true,
          headshotUrl: true,
          club: { select: { id: true, name: true, abbreviation: true } },
        },
      },
    },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({ queue: updatedQueue });
}
