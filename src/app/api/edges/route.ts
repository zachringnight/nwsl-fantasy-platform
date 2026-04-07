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
  const minEdgeParam = searchParams.get("minEdge");
  const minEdge = minEdgeParam ? parseFloat(minEdgeParam) : 0;

  if (Number.isNaN(minEdge)) {
    return NextResponse.json(
      { error: "minEdge must be a valid number" },
      { status: 400 }
    );
  }

  try {
    const edges = await prisma.bettingEdge.findMany({
      where: {
        edge: { gt: minEdge },
      },
      include: {
        prediction: {
          include: {
            fixture: {
              include: {
                homeClub: true,
                awayClub: true,
              },
            },
          },
        },
      },
      orderBy: { edge: "desc" },
      take: 50,
    });

    return NextResponse.json({ edges });
  } catch (err) {
    console.error("[edges:GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch edges" },
      { status: 500 }
    );
  }
}
