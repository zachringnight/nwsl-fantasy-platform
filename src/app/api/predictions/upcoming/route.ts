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

  try {
    const predictions = await prisma.modelPrediction.findMany({
      where: {
        fixture: {
          startsAt: { gte: new Date() },
        },
      },
      include: {
        fixture: {
          include: {
            homeClub: true,
            awayClub: true,
          },
        },
      },
      orderBy: {
        fixture: { startsAt: "asc" },
      },
      take: 50,
    });

    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("[predictions/upcoming:GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch upcoming predictions" },
      { status: 500 }
    );
  }
}
