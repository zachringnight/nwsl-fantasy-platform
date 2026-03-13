import { generateWeeklyMatchupsJob } from "@/jobs/generate-weekly-matchups-job";
import { processWaiversJob } from "@/jobs/process-waivers-job";
import { recomputeFantasyPointsJob } from "@/jobs/recompute-fantasy-points-job";
import { sendNotificationsJob } from "@/jobs/send-notifications-job";
import { syncFixturesJob } from "@/jobs/sync-fixtures-job";
import { syncPlayerStatsJob } from "@/jobs/sync-player-stats-job";

export const backgroundJobs = [
  syncFixturesJob,
  syncPlayerStatsJob,
  recomputeFantasyPointsJob,
  generateWeeklyMatchupsJob,
  processWaiversJob,
  sendNotificationsJob,
] as const;
