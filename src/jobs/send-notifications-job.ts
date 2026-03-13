import type { JobDefinition } from "@/types/jobs";

export const sendNotificationsJob: JobDefinition = {
  id: "send-notifications",
  description: "Deliver in-app, email, and push notifications based on user preferences.",
  frequency: "Event-driven with scheduled reminders for lineup lock and draft start",
  async run() {
    return {
      jobId: "send-notifications",
      status: "skipped",
      summary: "Notification delivery scaffold is ready for channel adapters.",
    };
  },
};
