import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized, badRequest } from "@/lib/api-helpers";
import type { PlayerPosition } from "@/generated/prisma/client";

const VALID_POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const position = searchParams.get("position");
  const clubId = searchParams.get("clubId");
  const search = searchParams.get("search");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 25)));

  if (position && !VALID_POSITIONS.includes(position as PlayerPosition)) {
    return badRequest(`Invalid position. Must be one of: ${VALID_POSITIONS.join(", ")}`);
  }

  const where: Record<string, unknown> = { status: "ACTIVE" };

  if (position) {
    where.primaryPosition = position;
  }

  if (clubId) {
    where.currentClubId = clubId;
  }

  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where,
      include: {
        club: {
          select: {
            id: true,
            name: true,
            abbreviation: true,
            primaryColor: true,
          },
        },
      },
      orderBy: [{ displayName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.player.count({ where }),
  ]);

  return NextResponse.json({
    players,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
