import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  unauthorized,
  badRequest,
  generateSlug,
} from "@/lib/api-helpers";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const leagues = await prisma.league.findMany({
    where: {
      memberships: { some: { userId: user.id } },
    },
    include: {
      _count: { select: { memberships: true } },
      settings: true,
      draft: { select: { id: true, status: true, scheduledAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ leagues });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  let body: { name?: string; description?: string; privacy?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { name, description, privacy } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return badRequest("League name must be at least 2 characters");
  }

  if (name.trim().length > 50) {
    return badRequest("League name must be 50 characters or fewer");
  }

  const slug = generateSlug(name.trim());

  const league = await prisma.$transaction(async (tx) => {
    const newLeague = await tx.league.create({
      data: {
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        privacy: privacy === "PUBLIC" ? "PUBLIC" : "PRIVATE",
        commissionerId: user.id,
      },
    });

    await tx.leagueSettings.create({
      data: { leagueId: newLeague.id },
    });

    const membership = await tx.leagueMembership.create({
      data: {
        leagueId: newLeague.id,
        userId: user.id,
        role: "COMMISSIONER",
      },
    });

    await tx.fantasyTeam.create({
      data: {
        leagueId: newLeague.id,
        membershipId: membership.id,
        name: `${user.name ?? "Manager"}'s Team`,
        abbreviation: (user.name ?? "MGR").substring(0, 3).toUpperCase(),
      },
    });

    return newLeague;
  });

  const fullLeague = await prisma.league.findUnique({
    where: { id: league.id },
    include: {
      _count: { select: { memberships: true } },
      settings: true,
    },
  });

  return NextResponse.json({ league: fullLeague }, { status: 201 });
}
