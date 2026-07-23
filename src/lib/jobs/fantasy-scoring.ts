import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { ingestMatchStats } from "@/lib/scoring/match-stat-ingest";

async function run(context: JobContext): Promise<JobResult> {
  const jobId = "fantasy-scoring";
  const matchId = String(context.params?.matchId ?? "");
  const seasonId = String(context.params?.seasonId ?? "");

  if (!matchId || !seasonId) {
    throw new Error(
      "fantasy-scoring requires params.matchId and params.seasonId"
    );
  }

  const result = await ingestMatchStats(matchId, seasonId);

  return {
    jobId,
    status: "success",
    summary: `Persisted ${result.statsWritten} stat lines and ${result.snapshotsComputed} point snapshots for ${matchId}.`,
  };
}

export const fantasyScoringJob: JobDefinition = {
  id: "fantasy-scoring",
  description:
    "Ingest one official NWSL match and persist real fantasy point snapshots.",
  frequency: "manual after lineup publication and again after final",
  run,
};
