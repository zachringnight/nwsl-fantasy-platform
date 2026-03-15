import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";
import { calculateFantasyScore, type StatLineInput } from "@/lib/scoring/scoring-engine";

export const recomputeFantasyPointsJob: JobDefinition = {
  id: "recompute-fantasy-points",
  description: "Recalculate fantasy point snapshots when stat lines change or overrides are applied.",
  frequency: "Event-driven after stat updates and corrections",
  async run(context: JobContext): Promise<JobResult> {
    const jobId = "recompute-fantasy-points";

    // Find stat lines from live or recently finalized fixtures
    const statLines = await prisma.playerMatchStatLine.findMany({
      where: {
        fixture: {
          status: { in: ["LIVE", "FINAL"] },
        },
      },
      include: {
        fixture: true,
        player: { select: { id: true, primaryPosition: true } },
      },
      take: 1000,
    });

    if (statLines.length === 0) {
      return {
        jobId,
        status: "skipped",
        summary: "No stat lines to score.",
      };
    }

    // Find all live leagues to create per-league snapshots
    const liveLeagues = await prisma.league.findMany({
      where: { status: "LIVE" },
      include: {
        weeks: {
          where: { status: { in: ["LIVE", "UPCOMING"] } },
          orderBy: { sequence: "asc" },
          take: 1,
        },
      },
    });

    let snapshotsCreated = 0;
    let snapshotsUpdated = 0;

    for (const statLine of statLines) {
      const input: StatLineInput = {
        position: statLine.player.primaryPosition,
        minutes: statLine.minutes,
        goals: statLine.goals,
        assists: statLine.assists,
        cleanSheet: statLine.cleanSheet,
        saves: statLine.saves,
        goalsConceded: statLine.goalsConceded,
        yellowCards: statLine.yellowCards,
        redCards: statLine.redCards,
        penaltySaves: statLine.penaltySaves,
        penaltyMisses: statLine.penaltyMisses,
      };

      const result = calculateFantasyScore(input);
      const isFinal = statLine.fixture.status === "FINAL";

      // Create/update a snapshot for each league that has an active week
      for (const league of liveLeagues) {
        const activeWeek = league.weeks[0];
        if (!activeWeek) continue;

        // Check if the fixture falls within this league week
        if (
          statLine.fixture.startsAt < activeWeek.startsAt ||
          statLine.fixture.startsAt > activeWeek.endsAt
        ) {
          continue;
        }

        // Apply any scoring overrides for this league/fixture/player
        const overrides = await prisma.scoringOverride.findMany({
          where: {
            leagueId: league.id,
            fixtureId: statLine.fixtureId,
            playerId: statLine.player.id,
          },
        });

        const overrideDelta = overrides.reduce(
          (sum, override) => sum + override.deltaPoints,
          0
        );

        const totalPoints = result.total + overrideDelta;

        const existingSnapshot = await prisma.fantasyPointSnapshot.findUnique({
          where: {
            leagueId_leagueWeekId_fixtureId_playerId: {
              leagueId: league.id,
              leagueWeekId: activeWeek.id,
              fixtureId: statLine.fixtureId,
              playerId: statLine.player.id,
            },
          },
        });

        if (existingSnapshot) {
          await prisma.fantasyPointSnapshot.update({
            where: { id: existingSnapshot.id },
            data: {
              totalPoints,
              breakdown: result.breakdown,
              statLineId: statLine.id,
              isFinal,
            },
          });
          snapshotsUpdated++;
        } else {
          await prisma.fantasyPointSnapshot.create({
            data: {
              leagueId: league.id,
              leagueWeekId: activeWeek.id,
              fixtureId: statLine.fixtureId,
              playerId: statLine.player.id,
              statLineId: statLine.id,
              totalPoints,
              breakdown: result.breakdown,
              isFinal,
            },
          });
          snapshotsCreated++;
        }
      }
    }

    return {
      jobId,
      status: "success",
      summary: `Scored ${statLines.length} stat lines. Created ${snapshotsCreated} new snapshots, updated ${snapshotsUpdated}. Started at ${context.startedAt}.`,
    };
  },
};
