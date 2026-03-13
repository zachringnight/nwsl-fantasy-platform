import { apiFootballProvider } from "@/providers/api-football/api-football-provider";
import type { JobDefinition } from "@/types/jobs";

export const syncPlayerStatsJob: JobDefinition = {
  id: "sync-player-stats",
  description: "Pull player stat lines and event deltas for live scoring.",
  frequency: "Every 60 seconds while fixtures are live",
  async run(context) {
    const result = await apiFootballProvider.getStatLines({
      startAt: context.startedAt,
      endAt: context.startedAt,
    });

    return {
      jobId: "sync-player-stats",
      status: result.status === "ready" ? "success" : "skipped",
      summary: result.status === "ready" ? "Player stat sync scaffold executed." : "API-Football key not configured.",
    };
  },
};
