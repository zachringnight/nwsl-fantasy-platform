import type { JobDefinition } from "@/types/jobs";
import { fixtureSyncJob } from "./fixture-sync";
import { statLineSyncJob } from "./stat-line-sync";
import { fantasyScoringJob } from "./fantasy-scoring";
import { availabilitySyncJob } from "./availability-sync";
import { syncPredictionsJob } from "./sync-predictions";
import { syncPlayerProjectionsJob } from "./sync-player-projections";
import { retrainModelJob } from "./retrain-model";

export const jobRegistry: JobDefinition[] = [
  fixtureSyncJob,
  statLineSyncJob,
  fantasyScoringJob,
  availabilitySyncJob,
  syncPredictionsJob,
  syncPlayerProjectionsJob,
  retrainModelJob,
];

export function getJob(jobId: string): JobDefinition | undefined {
  return jobRegistry.find((job) => job.id === jobId);
}
