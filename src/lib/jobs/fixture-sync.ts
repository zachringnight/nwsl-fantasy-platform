import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "fixture-sync";

  return {
    jobId,
    status: "skipped",
    summary: `Fixture sync is handled by the official match ingest with explicit season and match parameters. Checked at ${context.startedAt}.`,
  };
}

export const fixtureSyncJob: JobDefinition = {
  id: "fixture-sync",
  description: "Legacy fixture checkpoint; official match ingest owns scoring fixtures.",
  frequency: "manual diagnostic",
  run,
};
