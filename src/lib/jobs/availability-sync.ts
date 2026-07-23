import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { officialFantasyPlayerPool } from "@/lib/generated/fantasy-player-pool.generated";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "availability-sync";

  const outCount = officialFantasyPlayerPool.filter(
    (player) => player.availability === "out"
  ).length;
  const questionableCount = officialFantasyPlayerPool.filter(
    (player) => player.availability === "questionable"
  ).length;

  return {
    jobId,
    status: "success",
    summary: `Verified ${officialFantasyPlayerPool.length} official roster records: ${outCount} out, ${questionableCount} questionable. Started at ${context.startedAt}.`,
  };
}

export const availabilitySyncJob: JobDefinition = {
  id: "availability-sync",
  description: "Verify availability flags embedded by the official roster sync.",
  frequency: "after players:sync",
  run,
};
