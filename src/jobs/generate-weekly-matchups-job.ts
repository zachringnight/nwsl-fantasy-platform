import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateRoundRobinSchedule(teamIds: string[]): string[][][] {
  const teams = [...teamIds];

  // If odd number of teams, add a bye placeholder
  if (teams.length % 2 !== 0) {
    teams.push("BYE");
  }

  const totalRounds = teams.length - 1;
  const halfSize = teams.length / 2;
  const schedule: string[][][] = [];

  // Standard round-robin rotation
  const fixedTeam = teams[0];
  const rotatingTeams = teams.slice(1);

  for (let round = 0; round < totalRounds; round++) {
    const roundMatchups: string[][] = [];

    // First matchup includes the fixed team
    const opponent = rotatingTeams[round % rotatingTeams.length];
    if (opponent !== "BYE" && fixedTeam !== "BYE") {
      roundMatchups.push(
        round % 2 === 0 ? [fixedTeam, opponent] : [opponent, fixedTeam]
      );
    }

    // Remaining matchups from rotating teams
    for (let i = 1; i < halfSize; i++) {
      const home = rotatingTeams[(round + i) % rotatingTeams.length];
      const away =
        rotatingTeams[(round + rotatingTeams.length - i) % rotatingTeams.length];

      if (home !== "BYE" && away !== "BYE") {
        roundMatchups.push([home, away]);
      }
    }

    schedule.push(roundMatchups);
  }

  return schedule;
}

export const generateWeeklyMatchupsJob: JobDefinition = {
  id: "generate-weekly-matchups",
  description: "Create weekly head-to-head pairings and seed standings snapshots.",
  frequency: "Once per league after draft finalization and before each fantasy week opens",
  async run(context: JobContext): Promise<JobResult> {
    const jobId = "generate-weekly-matchups";

    // Find LIVE leagues that have weeks without matchups
    const leagues = await prisma.league.findMany({
      where: {
        status: "LIVE",
        draft: { status: "COMPLETE" },
      },
      include: {
        teams: { select: { id: true } },
        weeks: {
          where: { status: "UPCOMING" },
          orderBy: { sequence: "asc" },
        },
      },
    });

    if (leagues.length === 0) {
      return {
        jobId,
        status: "skipped",
        summary: "No live leagues need matchup generation.",
      };
    }

    let totalMatchupsCreated = 0;
    let leaguesProcessed = 0;

    for (const league of leagues) {
      if (league.teams.length < 2) continue;

      // Check which weeks already have matchups
      const weeksNeedingMatchups: typeof league.weeks = [];
      for (const week of league.weeks) {
        const existingMatchups = await prisma.matchup.count({
          where: { leagueWeekId: week.id },
        });
        if (existingMatchups === 0) {
          weeksNeedingMatchups.push(week);
        }
      }

      if (weeksNeedingMatchups.length === 0) continue;

      const teamIds = shuffleArray(league.teams.map((t) => t.id));
      const schedule = generateRoundRobinSchedule(teamIds);

      for (let i = 0; i < weeksNeedingMatchups.length; i++) {
        const week = weeksNeedingMatchups[i];
        // Cycle through the round-robin schedule
        const roundMatchups = schedule[i % schedule.length];

        for (const [homeTeamId, awayTeamId] of roundMatchups) {
          await prisma.matchup.create({
            data: {
              leagueWeekId: week.id,
              homeTeamId,
              awayTeamId,
              outcome: "PENDING",
            },
          });
          totalMatchupsCreated++;
        }

        // Seed standing entries for each team
        for (const team of league.teams) {
          const existingStanding = await prisma.standingEntry.findUnique({
            where: {
              leagueWeekId_fantasyTeamId: {
                leagueWeekId: week.id,
                fantasyTeamId: team.id,
              },
            },
          });

          if (!existingStanding) {
            // Get the previous week's standing as a base
            const previousWeekStanding = week.sequence > 1
              ? await prisma.standingEntry.findFirst({
                  where: {
                    leagueId: league.id,
                    fantasyTeamId: team.id,
                    week: { sequence: week.sequence - 1 },
                  },
                })
              : null;

            await prisma.standingEntry.create({
              data: {
                leagueId: league.id,
                leagueWeekId: week.id,
                fantasyTeamId: team.id,
                rank: 1,
                wins: previousWeekStanding?.wins ?? 0,
                losses: previousWeekStanding?.losses ?? 0,
                ties: previousWeekStanding?.ties ?? 0,
                pointsFor: previousWeekStanding?.pointsFor ?? 0,
                pointsAgainst: previousWeekStanding?.pointsAgainst ?? 0,
              },
            });
          }
        }
      }

      leaguesProcessed++;
    }

    return {
      jobId,
      status: "success",
      summary: `Generated ${totalMatchupsCreated} matchups for ${leaguesProcessed} leagues. Started at ${context.startedAt}.`,
    };
  },
};
