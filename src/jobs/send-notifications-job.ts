import type { JobDefinition, JobContext, JobResult } from "@/types/jobs";
import { prisma } from "@/lib/prisma";

export const sendNotificationsJob: JobDefinition = {
  id: "send-notifications",
  description: "Deliver in-app, email, and push notifications based on user preferences.",
  frequency: "Event-driven with scheduled reminders for lineup lock and draft start",
  async run(context: JobContext): Promise<JobResult> {
    const jobId = "send-notifications";

    // Find unsent in-app notifications
    const unsentNotifications = await prisma.notification.findMany({
      where: {
        sentAt: null,
        channel: "IN_APP",
      },
      include: {
        user: {
          include: { notificationPreference: true },
        },
      },
      take: 200,
    });

    if (unsentNotifications.length === 0) {
      // Check for upcoming events that need notifications
      const notificationsGenerated = await generateScheduledNotifications();

      if (notificationsGenerated === 0) {
        return {
          jobId,
          status: "skipped",
          summary: "No pending notifications to send.",
        };
      }

      return {
        jobId,
        status: "success",
        summary: `Generated ${notificationsGenerated} new scheduled notifications. Started at ${context.startedAt}.`,
      };
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const notification of unsentNotifications) {
      const prefs = notification.user.notificationPreference;

      // Check if user has this notification type enabled
      const isEnabled = checkNotificationPreference(
        prefs,
        notification.type
      );

      if (!isEnabled) {
        skippedCount++;
        continue;
      }

      // Mark as sent (in-app notifications are instantly "delivered")
      await prisma.notification.update({
        where: { id: notification.id },
        data: { sentAt: new Date() },
      });
      sentCount++;
    }

    return {
      jobId,
      status: "success",
      summary: `Processed ${unsentNotifications.length} notifications (${sentCount} sent, ${skippedCount} skipped by preference). Started at ${context.startedAt}.`,
    };
  },
};

function checkNotificationPreference(
  prefs: { draftStarting: boolean; lineupLock: boolean; waiverProcessed: boolean; matchupResult: boolean; inAppEnabled: boolean } | null,
  type: string
): boolean {
  if (!prefs || !prefs.inAppEnabled) return true; // Default to enabled

  switch (type) {
    case "DRAFT_STARTING":
      return prefs.draftStarting;
    case "LINEUP_LOCK":
      return prefs.lineupLock;
    case "WAIVER_PROCESSED":
      return prefs.waiverProcessed;
    case "MATCHUP_RESULT":
      return prefs.matchupResult;
    case "COMMISSIONER_ANNOUNCEMENT":
      return true; // Always deliver commissioner announcements
    default:
      return true;
  }
}

async function generateScheduledNotifications(): Promise<number> {
  let count = 0;
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

  // Notify about drafts starting within 1 hour
  const upcomingDrafts = await prisma.draft.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: {
        gte: now,
        lte: oneHourFromNow,
      },
    },
    include: {
      league: {
        include: {
          memberships: { select: { userId: true } },
        },
      },
    },
  });

  for (const draft of upcomingDrafts) {
    for (const membership of draft.league.memberships) {
      // Check if notification already exists
      const existing = await prisma.notification.findFirst({
        where: {
          userId: membership.userId,
          leagueId: draft.leagueId,
          type: "DRAFT_STARTING",
          createdAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: membership.userId,
            leagueId: draft.leagueId,
            type: "DRAFT_STARTING",
            channel: "IN_APP",
            title: "Draft starting soon",
            body: `The draft for ${draft.league.name} starts at ${draft.scheduledAt.toLocaleTimeString()}.`,
          },
        });
        count++;
      }
    }
  }

  // Notify about lineup locks within 2 hours
  const upcomingWeeks = await prisma.leagueWeek.findMany({
    where: {
      status: "UPCOMING",
      startsAt: {
        gte: now,
        lte: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
    },
    include: {
      league: {
        include: {
          memberships: { select: { userId: true } },
        },
      },
    },
  });

  for (const week of upcomingWeeks) {
    for (const membership of week.league.memberships) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: membership.userId,
          leagueId: week.leagueId,
          type: "LINEUP_LOCK",
          createdAt: { gte: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: membership.userId,
            leagueId: week.leagueId,
            type: "LINEUP_LOCK",
            channel: "IN_APP",
            title: "Lineups lock soon",
            body: `${week.label} lineups lock at ${week.startsAt.toLocaleTimeString()}. Set your lineup now.`,
          },
        });
        count++;
      }
    }
  }

  return count;
}
