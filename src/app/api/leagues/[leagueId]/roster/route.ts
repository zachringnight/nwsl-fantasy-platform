import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  unauthorized,
  notFound,
  requireMembership,
} from "@/lib/api-helpers";

type RouteParams = { params: Promise<{ leagueId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found for your membership");

  const rosterSpots = await prisma.rosterSpot.findMany({
    where: {
      fantasyTeamId: membership.team.id,
      releasedAt: null,
    },
    include: {
      player: {
        include: {
          club: { select: { id: true, name: true, abbreviation: true, primaryColor: true } },
        },
      },
    },
    orderBy: { acquiredAt: "asc" },
  });

  return NextResponse.json({ roster: rosterSpots, teamId: membership.team.id });
}
