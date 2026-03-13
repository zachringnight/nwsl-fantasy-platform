import type { JobDefinition } from "@/types/jobs";

export const recomputeFantasyPointsJob: JobDefinition = {
  id: "recompute-fantasy-points",
  description: "Recalculate fantasy point snapshots when stat lines change or overrides are applied.",
  frequency: "Event-driven after stat updates and corrections",
  async run() {
    return {
      jobId: "recompute-fantasy-points",
      status: "skipped",
      summary: "Point recompute job scaffold is wired and waiting on database integration.",
    };
  },
};
