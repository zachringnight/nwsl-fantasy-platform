import type { JobDefinition } from "@/types/jobs";

export const generateWeeklyMatchupsJob: JobDefinition = {
  id: "generate-weekly-matchups",
  description: "Create weekly head-to-head pairings and seed standings snapshots.",
  frequency: "Once per league after draft finalization and before each fantasy week opens",
  async run() {
    return {
      jobId: "generate-weekly-matchups",
      status: "skipped",
      summary: "Weekly matchup generator scaffold is ready for schedule logic.",
    };
  },
};
