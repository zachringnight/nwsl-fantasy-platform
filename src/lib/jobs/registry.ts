import type { JobDefinition } from "@/types/jobs";
import { fixtureSyncJob } from "./fixture-sync";
import { statLineSyncJob } from "./stat-line-sync";
import { fantasyScoringJob } from "./fantasy-scoring";
import { availabilitySyncJob } from "./availability-sync";
import { processWaiversJob } from "@/jobs/process-waivers-job";
import { generateWeeklyMatchupsJob } from "@/jobs/generate-weekly-matchups-job";
import { recomputeFantasyPointsJob } from "@/jobs/recompute-fantasy-points-job";
import { sendNotificationsJob } from "@/jobs/send-notifications-job";

export const jobRegistry: JobDefinition[] = [
  fixtureSyncJob,
  statLineSyncJob,
  fantasyScoringJob,
  availabilitySyncJob,
  processWaiversJob,
  generateWeeklyMatchupsJob,
  recomputeFantasyPointsJob,
  sendNotificationsJob,
];

export function getJob(jobId: string): JobDefinition | undefined {
  return jobRegistry.find((job) => job.id === jobId);
}
