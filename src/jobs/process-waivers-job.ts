import type { JobDefinition } from "@/types/jobs";

export const processWaiversJob: JobDefinition = {
  id: "process-waivers",
  description: "Resolve rolling-priority waiver claims and create transaction records.",
  frequency: "Tuesday 02:00 in league local time",
  async run() {
    return {
      jobId: "process-waivers",
      status: "skipped",
      summary: "Waiver processor scaffold is ready for transaction logic.",
    };
  },
};
