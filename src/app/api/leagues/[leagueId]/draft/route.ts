import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  unauthorized,
  notFound,
  forbidden,
  badRequest,
  requireMembership,
  requireCommissioner,
} from "@/lib/api-helpers";

type RouteParams = { params: Promise<{ leagueId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");

  const draft = await prisma.draft.findUnique({
    where: { leagueId },
    include: {
      slots: {
        include: {
          fantasyTeam: { select: { id: true, name: true, abbreviation: true } },
          pick: {
            include: {
              player: {
                select: { id: true, displayName: true, primaryPosition: true, headshotUrl: true },
              },
            },
          },
        },
        orderBy: { overallPick: "asc" },
      },
      picks: {
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
          fantasyTeam: { select: { id: true, name: true, abbreviation: true } },
        },
        orderBy: { overallPick: "asc" },
      },
    },
  });

  if (!draft) return notFound("Draft not found");

  // Include user's queue if they have a team
  let queue = null;
  if (membership.team) {
    queue = await prisma.draftQueueItem.findMany({
      where: { draftId: draft.id, fantasyTeamId: membership.team.id },
      include: {
        player: {
          select: { id: true, displayName: true, primaryPosition: true },
        },
      },
      orderBy: { position: "asc" },
    });
  }

  return NextResponse.json({ draft, queue });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return badRequest("You do not have a team in this league");

  let body: { playerId?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { playerId } = body;
  if (!playerId || typeof playerId !== "string") {
    return badRequest("playerId is required");
  }

  const draft = await prisma.draft.findUnique({
    where: { leagueId },
    include: {
      slots: { orderBy: { overallPick: "asc" } },
    },
  });

  if (!draft) return notFound("Draft not found");
  if (draft.status !== "LIVE") return badRequest("Draft is not currently live");

  // Find current slot
  const currentSlot = draft.slots.find(
    (s) => s.overallPick === draft.currentPickNumber
  );

  if (!currentSlot) return badRequest("No current draft slot found");
  if (currentSlot.fantasyTeamId !== membership.team.id) {
    return forbidden("It is not your turn to pick");
  }

  // Check player is available (not already drafted)
  const existingPick = await prisma.draftPick.findUnique({
    where: { draftId_playerId: { draftId: draft.id, playerId } },
  });

  if (existingPick) return badRequest("Player has already been drafted");

  // Verify player exists
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return notFound("Player not found");

  // Make the pick
  const pick = await prisma.$transaction(async (tx) => {
    const newPick = await tx.draftPick.create({
      data: {
        draftId: draft.id,
        draftSlotId: currentSlot.id,
        fantasyTeamId: membership.team!.id,
        playerId,
        round: currentSlot.round,
        overallPick: currentSlot.overallPick,
        source: "MANUAL",
      },
    });

    // Add player to roster
    await tx.rosterSpot.create({
      data: {
        fantasyTeamId: membership.team!.id,
        playerId,
        acquisitionType: "DRAFT",
        acquisitionSourceId: newPick.id,
      },
    });

    // Advance draft
    const nextPick = draft.currentPickNumber + 1;
    const nextSlot = draft.slots.find((s) => s.overallPick === nextPick);

    if (nextSlot) {
      await tx.draft.update({
        where: { id: draft.id },
        data: {
          currentPickNumber: nextPick,
          currentRound: nextSlot.round,
          currentSlot: nextSlot.pickInRound,
        },
      });
    } else {
      // Draft is complete
      await tx.draft.update({
        where: { id: draft.id },
        data: {
          status: "COMPLETE",
          completedAt: new Date(),
        },
      });
    }

    // Remove from queue if present
    await tx.draftQueueItem.deleteMany({
      where: {
        draftId: draft.id,
        playerId,
      },
    });

    return newPick;
  });

  const fullPick = await prisma.draftPick.findUnique({
    where: { id: pick.id },
    include: {
      player: {
        include: {
          club: { select: { id: true, name: true, abbreviation: true } },
        },
      },
      fantasyTeam: { select: { id: true, name: true, abbreviation: true } },
    },
  });

  return NextResponse.json({ pick: fullPick }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireCommissioner(leagueId, user.id);
  if (!membership) return forbidden("Only the commissioner can manage draft status");

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { action } = body;
  if (!action || !["start", "pause", "resume"].includes(action)) {
    return badRequest("action must be one of: start, pause, resume");
  }

  const draft = await prisma.draft.findUnique({ where: { leagueId } });
  if (!draft) return notFound("Draft not found");

  let updateData: Record<string, unknown> = {};

  switch (action) {
    case "start":
      if (draft.status !== "SCHEDULED" && draft.status !== "LOBBY") {
        return badRequest("Draft can only be started from SCHEDULED or LOBBY status");
      }
      updateData = {
        status: "LIVE",
        startedAt: new Date(),
        roomOpenedAt: draft.roomOpenedAt ?? new Date(),
      };
      break;
    case "pause":
      if (draft.status !== "LIVE") {
        return badRequest("Can only pause a live draft");
      }
      updateData = {
        status: "PAUSED",
        pauseRequestedAt: new Date(),
      };
      break;
    case "resume":
      if (draft.status !== "PAUSED") {
        return badRequest("Can only resume a paused draft");
      }
      updateData = {
        status: "LIVE",
        pauseRequestedAt: null,
      };
      break;
  }

  const updatedDraft = await prisma.draft.update({
    where: { id: draft.id },
    data: updateData,
  });

  return NextResponse.json({ draft: updatedDraft });
}
