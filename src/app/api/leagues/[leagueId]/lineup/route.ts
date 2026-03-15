import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { LineupSlot, PlayerPosition } from "@/generated/prisma/client";
import {
  getAuthenticatedUser,
  unauthorized,
  notFound,
  badRequest,
  requireMembership,
} from "@/lib/api-helpers";

type RouteParams = { params: Promise<{ leagueId: string }> };

const SLOT_POSITION_RULES: Record<string, PlayerPosition[]> = {
  GK: ["GK"],
  DEF_1: ["DEF"],
  DEF_2: ["DEF"],
  MID_1: ["MID"],
  MID_2: ["MID"],
  MID_3: ["MID"],
  FWD_1: ["FWD"],
  FWD_2: ["FWD"],
  FLEX: ["DEF", "MID", "FWD"],
  BENCH_1: ["GK", "DEF", "MID", "FWD"],
  BENCH_2: ["GK", "DEF", "MID", "FWD"],
  BENCH_3: ["GK", "DEF", "MID", "FWD"],
};

const STARTER_SLOTS = new Set([
  "GK", "DEF_1", "DEF_2", "MID_1", "MID_2", "MID_3", "FWD_1", "FWD_2", "FLEX",
]);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  const { searchParams } = new URL(request.url);
  const weekSequence = searchParams.get("week");

  // Find the current (or requested) week
  const weekWhere = weekSequence
    ? { leagueId, sequence: Number(weekSequence) }
    : { leagueId, status: "UPCOMING" as const };

  const week = weekSequence
    ? await prisma.leagueWeek.findUnique({ where: { leagueId_sequence: weekWhere as { leagueId: string; sequence: number } } })
    : await prisma.leagueWeek.findFirst({ where: weekWhere, orderBy: { sequence: "asc" } });

  if (!week) return notFound("No matching week found");

  const lineup = await prisma.lineupEntry.findMany({
    where: {
      leagueWeekId: week.id,
      fantasyTeamId: membership.team.id,
    },
    include: {
      player: {
        include: {
          club: { select: { id: true, name: true, abbreviation: true } },
        },
      },
      rosterSpot: true,
    },
    orderBy: { slot: "asc" },
  });

  return NextResponse.json({ lineup, week });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { leagueId } = await params;

  const membership = await requireMembership(leagueId, user.id);
  if (!membership) return notFound("League not found");
  if (!membership.team) return notFound("No team found");

  let body: {
    weekId?: string;
    entries?: Array<{ slot: LineupSlot; playerId: string; rosterSpotId: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { weekId, entries } = body;

  if (!weekId || !entries || !Array.isArray(entries)) {
    return badRequest("weekId and entries array are required");
  }

  // Validate week exists and is not locked
  const week = await prisma.leagueWeek.findUnique({ where: { id: weekId } });
  if (!week || week.leagueId !== leagueId) {
    return notFound("Week not found");
  }
  if (week.status === "FINAL") {
    return badRequest("Cannot modify lineup for a finalized week");
  }

  // Get user's active roster
  const rosterSpots = await prisma.rosterSpot.findMany({
    where: { fantasyTeamId: membership.team.id, releasedAt: null },
    include: { player: true },
  });

  const rosterSpotMap = new Map(rosterSpots.map((rs) => [rs.id, rs]));

  // Validate each entry
  const usedPlayerIds = new Set<string>();
  for (const entry of entries) {
    const allowedPositions = SLOT_POSITION_RULES[entry.slot];
    if (!allowedPositions) {
      return badRequest(`Invalid lineup slot: ${entry.slot}`);
    }

    const rosterSpot = rosterSpotMap.get(entry.rosterSpotId);
    if (!rosterSpot) {
      return badRequest(`Player with roster spot ${entry.rosterSpotId} is not on your roster`);
    }

    if (rosterSpot.playerId !== entry.playerId) {
      return badRequest("Roster spot / player mismatch");
    }

    if (!allowedPositions.includes(rosterSpot.player.primaryPosition)) {
      return badRequest(
        `${rosterSpot.player.displayName} (${rosterSpot.player.primaryPosition}) cannot be placed in ${entry.slot}`
      );
    }

    if (usedPlayerIds.has(entry.playerId)) {
      return badRequest(`Player ${rosterSpot.player.displayName} is assigned to multiple slots`);
    }
    usedPlayerIds.add(entry.playerId);
  }

  // Replace lineup entries in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.lineupEntry.deleteMany({
      where: {
        leagueWeekId: weekId,
        fantasyTeamId: membership.team!.id,
      },
    });

    await tx.lineupEntry.createMany({
      data: entries.map((entry) => ({
        leagueWeekId: weekId,
        fantasyTeamId: membership.team!.id,
        rosterSpotId: entry.rosterSpotId,
        playerId: entry.playerId,
        slot: entry.slot,
        starter: STARTER_SLOTS.has(entry.slot),
      })),
    });
  });

  // Return the updated lineup
  const updatedLineup = await prisma.lineupEntry.findMany({
    where: {
      leagueWeekId: weekId,
      fantasyTeamId: membership.team.id,
    },
    include: {
      player: {
        include: {
          club: { select: { id: true, name: true, abbreviation: true } },
        },
      },
    },
    orderBy: { slot: "asc" },
  });

  return NextResponse.json({ lineup: updatedLineup, week });
}
