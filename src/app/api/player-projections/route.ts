import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createUnauthorizedResponse,
  getAuthenticatedRequestUser,
} from "@/lib/request-auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) {
    return createUnauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("playerId");
  const fixtureId = searchParams.get("fixtureId");

  if (!playerId && !fixtureId) {
    return NextResponse.json(
      { error: "At least one of playerId or fixtureId query parameters is required" },
      { status: 400 }
    );
  }

  try {
    const where: Record<string, string> = {};
    if (playerId) where.playerId = playerId;
    if (fixtureId) where.fixtureId = fixtureId;

    const projections = await prisma.playerProjection.findMany({ where });

    return NextResponse.json({ projections });
  } catch (err) {
    console.error("[player-projections:GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch player projections" },
      { status: 500 }
    );
  }
}
