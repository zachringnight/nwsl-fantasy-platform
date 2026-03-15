import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";
import { calculateFantasyScore, type StatLineInput } from "@/lib/scoring/scoring-engine";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "fantasy-scoring";

  // Find all stat lines from live or recently final fixtures
  const unscoredStatLines = await prisma.playerMatchStatLine.findMany({
    where: {
      fixture: {
        status: { in: ["LIVE", "FINAL"] },
      },
    },
    include: {
      fixture: true,
      player: { select: { id: true, primaryPosition: true } },
    },
    take: 500,
  });

  if (unscoredStatLines.length === 0) {
    return {
      jobId,
      status: "skipped",
      summary: "No stat lines to score.",
    };
  }

  // Find leagues with active weeks to create per-league snapshots
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

  let scored = 0;
  let snapshotsWritten = 0;

  for (const statLine of unscoredStatLines) {
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
    scored++;

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

      // Upsert the fantasy point snapshot
      await prisma.fantasyPointSnapshot.upsert({
        where: {
          leagueId_leagueWeekId_fixtureId_playerId: {
            leagueId: league.id,
            leagueWeekId: activeWeek.id,
            fixtureId: statLine.fixtureId,
            playerId: statLine.player.id,
          },
        },
        update: {
          totalPoints: result.total,
          breakdown: result.breakdown,
          statLineId: statLine.id,
          isFinal,
        },
        create: {
          leagueId: league.id,
          leagueWeekId: activeWeek.id,
          fixtureId: statLine.fixtureId,
          playerId: statLine.player.id,
          statLineId: statLine.id,
          totalPoints: result.total,
          breakdown: result.breakdown,
          isFinal,
        },
      });
      snapshotsWritten++;
    }
  }

  return {
    jobId,
    status: "success",
    summary: `Scored ${scored} player stat lines, wrote ${snapshotsWritten} snapshots. Started at ${context.startedAt}.`,
  };
}

export const fantasyScoringJob: JobDefinition = {
  id: "fantasy-scoring",
  description: "Calculate fantasy points from player stat lines and write FantasyPointSnapshot records.",
  frequency: "every 2 minutes during live matches, once after final",
  run,
};
