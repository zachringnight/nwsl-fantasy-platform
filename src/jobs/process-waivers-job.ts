import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";

export const processWaiversJob: JobDefinition = {
  id: "process-waivers",
  description: "Resolve rolling-priority waiver claims and create transaction records.",
  frequency: "Tuesday 02:00 in league local time",
  async run(context: JobContext): Promise<JobResult> {
    const jobId = "process-waivers";

    // Find all leagues with ROLLING_PRIORITY waiver model that have pending claims
    const leaguesWithClaims = await prisma.league.findMany({
      where: {
        status: "LIVE",
        waiverClaims: {
          some: { status: "PENDING" },
        },
      },
      include: {
        settings: true,
      },
    });

    if (leaguesWithClaims.length === 0) {
      return {
        jobId,
        status: "skipped",
        summary: "No leagues with pending waiver claims.",
      };
    }

    let totalProcessed = 0;
    let totalWon = 0;
    let totalLost = 0;

    for (const league of leaguesWithClaims) {
      // Get pending claims ordered by waiver priority (lowest number = highest priority)
      const pendingClaims = await prisma.waiverClaim.findMany({
        where: {
          leagueId: league.id,
          status: "PENDING",
        },
        include: {
          fantasyTeam: true,
          requestedPlayer: true,
        },
        orderBy: [
          { priorityAtSubmission: "asc" },
          { createdAt: "asc" },
        ],
      });

      // Track which players have been claimed in this processing run
      const claimedPlayerIds = new Set<string>();

      for (const claim of pendingClaims) {
        totalProcessed++;

        // Skip if the requested player was already claimed by a higher-priority team
        if (claimedPlayerIds.has(claim.requestedPlayerId)) {
          await prisma.waiverClaim.update({
            where: { id: claim.id },
            data: {
              status: "LOST",
              processedAt: new Date(),
            },
          });
          totalLost++;
          continue;
        }

        // Check if the player is already on another roster
        const existingRoster = await prisma.rosterSpot.findFirst({
          where: {
            playerId: claim.requestedPlayerId,
            releasedAt: null,
            fantasyTeam: { leagueId: league.id },
          },
        });

        if (existingRoster) {
          await prisma.waiverClaim.update({
            where: { id: claim.id },
            data: {
              status: "LOST",
              processedAt: new Date(),
            },
          });
          totalLost++;
          continue;
        }

        // Process the winning claim in a transaction
        await prisma.$transaction(async (tx) => {
          // Drop player if specified
          if (claim.dropPlayerId) {
            await tx.rosterSpot.updateMany({
              where: {
                fantasyTeamId: claim.fantasyTeamId,
                playerId: claim.dropPlayerId,
                releasedAt: null,
              },
              data: { releasedAt: new Date() },
            });

            await tx.transaction.create({
              data: {
                leagueId: league.id,
                fantasyTeamFromId: claim.fantasyTeamId,
                playerId: claim.dropPlayerId,
                type: "DROP",
                status: "PROCESSED",
                processedAt: new Date(),
              },
            });
          }

          // Add the requested player to the roster
          await tx.rosterSpot.create({
            data: {
              fantasyTeamId: claim.fantasyTeamId,
              playerId: claim.requestedPlayerId,
              acquisitionType: "WAIVER_ADD",
            },
          });

          // Create the transaction record
          const transaction = await tx.transaction.create({
            data: {
              leagueId: league.id,
              fantasyTeamToId: claim.fantasyTeamId,
              playerId: claim.requestedPlayerId,
              type: "WAIVER_ADD",
              status: "PROCESSED",
              processedAt: new Date(),
            },
          });

          // Update the claim
          await tx.waiverClaim.update({
            where: { id: claim.id },
            data: {
              status: "WON",
              processedAt: new Date(),
              processedTransactionId: transaction.id,
            },
          });

          // Rotate waiver priority: winning team goes to last priority
          const teamsInLeague = await tx.fantasyTeam.findMany({
            where: { leagueId: league.id },
            orderBy: { waiverPriority: "asc" },
          });

          const winnerPriority = claim.priorityAtSubmission;
          for (const team of teamsInLeague) {
            if (team.id === claim.fantasyTeamId) {
              await tx.fantasyTeam.update({
                where: { id: team.id },
                data: { waiverPriority: teamsInLeague.length },
              });
            } else if (
              team.waiverPriority !== null &&
              team.waiverPriority > winnerPriority
            ) {
              await tx.fantasyTeam.update({
                where: { id: team.id },
                data: { waiverPriority: team.waiverPriority - 1 },
              });
            }
          }
        });

        claimedPlayerIds.add(claim.requestedPlayerId);
        totalWon++;
      }
    }

    return {
      jobId,
      status: "success",
      summary: `Processed ${totalProcessed} waiver claims across ${leaguesWithClaims.length} leagues (${totalWon} won, ${totalLost} lost). Started at ${context.startedAt}.`,
    };
  },
};
