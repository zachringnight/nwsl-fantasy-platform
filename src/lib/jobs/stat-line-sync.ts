import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "stat-line-sync";

  return {
    jobId,
    status: "skipped",
    summary: `Stat-line sync is superseded by fantasy-scoring, which writes official Supabase snapshots. Checked at ${context.startedAt}.`,
  };
}

export const statLineSyncJob: JobDefinition = {
  id: "stat-line-sync",
  description: "Legacy stat-line checkpoint; fantasy-scoring owns official snapshots.",
  frequency: "manual diagnostic",
  run,
};
