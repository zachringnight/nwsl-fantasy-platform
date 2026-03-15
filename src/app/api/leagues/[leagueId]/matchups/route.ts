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
  const weekParam = searchParams.get("week");

  let week;
  if (weekParam) {
    const sequence = Number(weekParam);
    if (isNaN(sequence)) return badRequest("Invalid week number");
    week = await prisma.leagueWeek.findUnique({
      where: { leagueId_sequence: { leagueId, sequence } },
    });
  } else {
    // Default to current or most recent week
    week = await prisma.leagueWeek.findFirst({
      where: { leagueId, status: { in: ["LIVE", "UPCOMING"] } },
      orderBy: { sequence: "asc" },
    });
    if (!week) {
      week = await prisma.leagueWeek.findFirst({
        where: { leagueId },
        orderBy: { sequence: "desc" },
      });
    }
  }

  if (!week) return notFound("No weeks found for this league");

  const matchups = await prisma.matchup.findMany({
    where: { leagueWeekId: week.id },
    include: {
      homeTeam: {
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
      awayTeam: {
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
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ matchups, week });
}
