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
  const cursor = searchParams.get("cursor");
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));

  const messages = await prisma.chatMessage.findMany({
    where: {
      leagueId,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const nextCursor =
    messages.length === limit
      ? messages[messages.length - 1].createdAt.toISOString()
      : null;

  return NextResponse.json({ messages, nextCursor });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");

  let body: { body?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const messageBody = body.body;
  if (!messageBody || typeof messageBody !== "string" || messageBody.trim().length === 0) {
    return badRequest("Message body is required");
  }

  if (messageBody.trim().length > 2000) {
    return badRequest("Message must be 2000 characters or fewer");
  }

  const message = await prisma.chatMessage.create({
    data: {
      leagueId,
      userId: user.id,
      body: messageBody.trim(),
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ message }, { status: 201 });
}
