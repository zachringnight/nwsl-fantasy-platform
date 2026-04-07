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
  const fixtureId = searchParams.get("fixtureId");

  if (!fixtureId) {
    return NextResponse.json(
      { error: "fixtureId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const predictions = await prisma.modelPrediction.findMany({
      where: { fixtureId },
      include: { fairOdds: true },
    });

    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("[predictions:GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch predictions" },
      { status: 500 }
    );
  }
}
