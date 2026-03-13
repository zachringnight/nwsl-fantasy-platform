import { apiFootballProvider } from "@/providers/api-football/api-football-provider";
import type { JobDefinition } from "@/types/jobs";

export const syncFixturesJob: JobDefinition = {
  id: "sync-fixtures",
  description: "Pull fixture updates and persist raw payloads plus normalized fixture state.",
  frequency: "Every 15 minutes during the season",
  async run(context) {
    const result = await apiFootballProvider.getFixtures({
      startAt: context.startedAt,
      endAt: context.startedAt,
    });

    return {
      jobId: "sync-fixtures",
      status: result.status === "ready" ? "success" : "skipped",
      summary: result.status === "ready" ? "Fixture sync scaffold executed." : "API-Football key not configured.",
    };
  },
};
