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

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");

  // Find the target week: specific, or the latest with FINAL status, or the latest overall
  let week;
  if (weekParam) {
    week = await prisma.leagueWeek.findUnique({
      where: { leagueId_sequence: { leagueId, sequence: Number(weekParam) } },
    });
  } else {
    week = await prisma.leagueWeek.findFirst({
      where: { leagueId, status: "FINAL" },
      orderBy: { sequence: "desc" },
    });
    if (!week) {
      week = await prisma.leagueWeek.findFirst({
        where: { leagueId },
        orderBy: { sequence: "desc" },
      });
    }
  }

  if (!week) return notFound("No weeks found");

  const standings = await prisma.standingEntry.findMany({
    where: { leagueId, leagueWeekId: week.id },
    include: {
      fantasyTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
          membership: {
            select: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
    orderBy: { rank: "asc" },
  });

  return NextResponse.json({ standings, week });
}
