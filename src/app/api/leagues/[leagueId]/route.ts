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

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      settings: true,
      memberships: {
        include: {
          user: { select: { id: true, name: true, image: true } },
          team: { select: { id: true, name: true, abbreviation: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      draft: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          startedAt: true,
          completedAt: true,
          currentRound: true,
          currentPickNumber: true,
        },
      },
      _count: { select: { memberships: true } },
    },
  });

  if (!league) return notFound("League not found");

  return NextResponse.json({ league, currentUserRole: membership.role });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireCommissioner(leagueId, user.id);
  if (!membership) return forbidden("Only the commissioner can update league settings");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const updateData: Record<string, unknown> = {};
  const settingsUpdate: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2) {
      return badRequest("League name must be at least 2 characters");
    }
    updateData.name = body.name.trim();
  }

  if (body.managerCountTarget !== undefined) {
    const count = Number(body.managerCountTarget);
    if (!Number.isInteger(count) || count < 4 || count > 20) {
      return badRequest("Manager count target must be between 4 and 20");
    }
    updateData.managerCountTarget = count;
  }

  if (body.description !== undefined) {
    updateData.description = typeof body.description === "string" ? body.description.trim() : null;
  }

  if (body.draftAt !== undefined) {
    const date = new Date(body.draftAt as string);
    if (isNaN(date.getTime())) {
      return badRequest("Invalid draft date");
    }
    if (date <= new Date()) {
      return badRequest("Draft date must be in the future");
    }
    // Update the draft's scheduledAt
    await prisma.draft.upsert({
      where: { leagueId },
      update: { scheduledAt: date },
      create: {
        leagueId,
        scheduledAt: date,
      },
    });
  }

  // Apply league-level updates
  if (body.rosterSize !== undefined) settingsUpdate.rosterSize = Number(body.rosterSize);
  if (body.maxPlayersPerClub !== undefined) settingsUpdate.maxPlayersPerClub = Number(body.maxPlayersPerClub);
  if (body.waiverModel !== undefined) settingsUpdate.waiverModel = body.waiverModel;
  if (body.lineupLockPolicy !== undefined) settingsUpdate.lineupLockPolicy = body.lineupLockPolicy;

  const league = await prisma.$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.league.update({ where: { id: leagueId }, data: updateData });
    }
    if (Object.keys(settingsUpdate).length > 0) {
      await tx.leagueSettings.update({
        where: { leagueId },
        data: settingsUpdate,
      });
    }
    return tx.league.findUnique({
      where: { id: leagueId },
      include: { settings: true, _count: { select: { memberships: true } } },
    });
  });

  return NextResponse.json({ league });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireCommissioner(leagueId, user.id);
  if (!membership) return forbidden("Only the commissioner can delete a league");

  await prisma.league.delete({ where: { id: leagueId } });

  return NextResponse.json({ success: true });
}
