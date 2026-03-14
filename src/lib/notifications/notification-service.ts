import { prisma } from "@/lib/prisma";
import { sendEmail } from "./email";

type DeliveryChannel = "in_app" | "email" | "push";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface NotificationPayload {
  userId: string;
  type: "DRAFT_STARTING" | "LINEUP_LOCK" | "WAIVER_PROCESSED" | "MATCHUP_RESULT" | "COMMISSIONER_ANNOUNCEMENT";
  title: string;
  body: string;
  leagueId?: string;
  channels: DeliveryChannel[];
  emailPayload?: EmailPayload;
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (payload.channels.includes("in_app")) {
    tasks.push(createInAppNotification(payload));
  }

  if (payload.channels.includes("email") && payload.emailPayload) {
    tasks.push(sendEmailNotification(payload));
  }

  if (payload.channels.includes("push")) {
    tasks.push(sendPushNotification(payload));
  }

  await Promise.allSettled(tasks);
}

async function createInAppNotification(payload: NotificationPayload): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: payload.userId,
      leagueId: payload.leagueId ?? null,
      type: payload.type,
      channel: "IN_APP",
      title: payload.title,
      body: payload.body,
      sentAt: new Date(),
    },
  });
}

async function sendEmailNotification(payload: NotificationPayload): Promise<void> {
  if (!payload.emailPayload) return;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { email: true },
  });

  if (!user?.email) return;

  // Also create an EMAIL notification record
  await prisma.notification.create({
    data: {
      userId: payload.userId,
      leagueId: payload.leagueId ?? null,
      type: payload.type,
      channel: "EMAIL",
      title: payload.title,
      body: payload.body,
      sentAt: new Date(),
    },
  });

  await sendEmail({
    ...payload.emailPayload,
    to: user.email,
  });
}

async function sendPushNotification(payload: NotificationPayload): Promise<void> {
  // Create a PUSH notification record
  await prisma.notification.create({
    data: {
      userId: payload.userId,
      leagueId: payload.leagueId ?? null,
      type: payload.type,
      channel: "PUSH",
      title: payload.title,
      body: payload.body,
    },
  });

  // Web Push delivery requires push subscription registration (stored per user).
  // Implementation will use the Web Push protocol when subscriptions are wired up.
}

export async function getUserNotifications(
  userId: string,
  options?: { limit?: number; unreadOnly?: boolean }
) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(options?.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 20,
  });
}

export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });

  return result.count > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return result.count;
}
