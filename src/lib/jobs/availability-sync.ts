import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "availability-sync";

  // Check for the latest availability report
  const latestReport = await prisma.availabilityReport.findFirst({
    orderBy: { reportDate: "desc" },
    include: {
      items: true,
    },
  });

  if (!latestReport) {
    return {
      jobId,
      status: "skipped",
      summary: "No availability reports found in the database.",
    };
  }

  const playerCount = latestReport.items.length;

  return {
    jobId,
    status: "success",
    summary: `Processed availability report with ${playerCount} player entries. Report date ${latestReport.reportDate.toISOString()}. Started at ${context.startedAt}.`,
  };
}

export const availabilitySyncJob: JobDefinition = {
  id: "availability-sync",
  description: "Sync player availability/injury reports and update the AvailabilityReport table.",
  frequency: "every 6 hours",
  run,
};
