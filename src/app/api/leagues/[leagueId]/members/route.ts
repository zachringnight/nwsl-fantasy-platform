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

  const members = await prisma.leagueMembership.findMany({
    where: { leagueId },
    include: {
      user: { select: { id: true, name: true, image: true, email: true } },
      team: { select: { id: true, name: true, abbreviation: true, draftSlot: true, waiverPriority: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ members });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { code } = body;
  if (!code || typeof code !== "string") {
    return badRequest("Invite code is required");
  }

  // Validate invite code
  const invite = await prisma.leagueInvite.findUnique({
    where: { code },
    include: { league: true },
  });

  if (!invite || invite.leagueId !== leagueId) {
    return badRequest("Invalid invite code");
  }

  if (invite.expiresAt < new Date()) {
    return badRequest("Invite code has expired");
  }

  // Check if already a member
  const existing = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });

  if (existing) {
    return badRequest("You are already a member of this league");
  }

  // Check manager count
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { _count: { select: { memberships: true } } },
  });

  if (!league) return notFound("League not found");

  if (league._count.memberships >= league.managerCountTarget) {
    return badRequest("League is full");
  }

  const result = await prisma.$transaction(async (tx) => {
    const membership = await tx.leagueMembership.create({
      data: {
        leagueId,
        userId: user.id,
        role: "MANAGER",
      },
    });

    const team = await tx.fantasyTeam.create({
      data: {
        leagueId,
        membershipId: membership.id,
        name: `${user.name ?? "Manager"}'s Team`,
        abbreviation: (user.name ?? "MGR").substring(0, 3).toUpperCase(),
      },
    });

    return { membership, team };
  });

  return NextResponse.json({ membership: result.membership, team: result.team }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const commMembership = await requireCommissioner(leagueId, user.id);
  if (!commMembership) return forbidden("Only the commissioner can remove members");

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { userId } = body;
  if (!userId || typeof userId !== "string") {
    return badRequest("userId is required");
  }

  if (userId === user.id) {
    return badRequest("Commissioner cannot remove themselves");
  }

  const targetMembership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!targetMembership) {
    return notFound("Member not found");
  }

  await prisma.leagueMembership.delete({
    where: { id: targetMembership.id },
  });

  return NextResponse.json({ success: true });
}
