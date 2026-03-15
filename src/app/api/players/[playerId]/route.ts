import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized, notFound } from "@/lib/api-helpers";

type RouteParams = { params: Promise<{ playerId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { playerId } = await params;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      club: {
        select: {
          id: true,
          name: true,
          shortName: true,
          abbreviation: true,
          primaryColor: true,
          secondaryColor: true,
        },
      },
      statLines: {
        include: {
          fixture: {
            select: {
              id: true,
              startsAt: true,
              status: true,
              homeClub: { select: { id: true, abbreviation: true } },
              awayClub: { select: { id: true, abbreviation: true } },
            },
          },
        },
        orderBy: { fixture: { startsAt: "desc" } },
        take: 20,
      },
      availabilityItems: {
        include: {
          report: { select: { reportDate: true } },
        },
        orderBy: { report: { reportDate: "desc" } },
        take: 1,
      },
    },
  });

  if (!player) return notFound("Player not found");

  // Aggregate season stats from stat lines
  const seasonStats = player.statLines.reduce(
    (acc, sl) => ({
      appearances: acc.appearances + 1,
      minutes: acc.minutes + sl.minutes,
      goals: acc.goals + sl.goals,
      assists: acc.assists + sl.assists,
      cleanSheets: acc.cleanSheets + (sl.cleanSheet ? 1 : 0),
      saves: acc.saves + sl.saves,
      yellowCards: acc.yellowCards + sl.yellowCards,
      redCards: acc.redCards + sl.redCards,
    }),
    {
      appearances: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      saves: 0,
      yellowCards: 0,
      redCards: 0,
    }
  );

  return NextResponse.json({
    player,
    seasonStats,
  });
}
