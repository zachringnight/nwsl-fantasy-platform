import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notification-service";
import {
  createUnauthorizedResponse,
  getAuthenticatedRequestUser,
} from "@/lib/request-auth";

const channelEnum = z.enum(["in_app", "email", "push"]);
const preferenceIdEnum = z.enum([
  "draft_turn",
  "entry_lock",
  "waiver_result",
  "matchup_final",
]);

const patchSchema = z.union([
  z.object({ action: z.literal("read"), notificationId: z.string().min(1) }),
  z.object({ action: z.literal("read_all") }),
  z.object({
    action: z.literal("update_channels"),
    channels: z.array(channelEnum),
  }),
  z.object({
    action: z.literal("update_type"),
    enabled: z.boolean(),
    preferenceId: preferenceIdEnum,
  }),
]);

const preferenceMeta = {
  draft_turn: {
    description: "Get notified when your draft pick is on deck.",
    field: "draftStarting",
    label: "Draft turn alerts",
  },
  entry_lock: {
    description: "15-minute warning before a salary-cap slate locks.",
    field: "lineupLock",
    label: "Entry lock warnings",
  },
  waiver_result: {
    description: "Know immediately when a claim is won, lost, or canceled.",
    field: "waiverProcessed",
    label: "Waiver claim results",
  },
  matchup_final: {
    description: "Get the final result when your weekly matchup settles.",
    field: "matchupResult",
    label: "Matchup final scores",
  },
} as const;

type PreferenceField =
  (typeof preferenceMeta)[keyof typeof preferenceMeta]["field"];

const preferenceSelect = {
  draftStarting: true,
  emailEnabled: true,
  inAppEnabled: true,
  lineupLock: true,
  matchupResult: true,
  pushEnabled: true,
  waiverProcessed: true,
} as const;

function buildChannelState(preference: {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
} | null) {
  return {
    email: preference?.emailEnabled ?? true,
    in_app: preference?.inAppEnabled ?? true,
    push: preference?.pushEnabled ?? false,
  };
}

function buildAlertPreferences(
  preference: {
    draftStarting: boolean;
    lineupLock: boolean;
    matchupResult: boolean;
    waiverProcessed: boolean;
  } | null
) {
  return Object.entries(preferenceMeta).map(([id, meta]) => ({
    description: meta.description,
    enabled: preference?.[meta.field] ?? true,
    id,
    label: meta.label,
  }));
}

export async function GET(request: Request) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) {
    return createUnauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 20), 1),
    100
  );

  try {
    const [notifications, unreadCount, preference] = await Promise.all([
      getUserNotifications(user.id, {
        limit,
        unreadOnly,
      }),
      prisma.notification.count({
        where: {
          readAt: null,
          userId: user.id,
        },
      }),
      prisma.notificationPreference.findUnique({
        where: { userId: user.id },
        select: preferenceSelect,
      }),
    ]);

    return NextResponse.json({
      alertPreferences: buildAlertPreferences(preference),
      deliveryChannels: buildChannelState(preference),
      notifications,
      unreadCount,
    });
  } catch (err) {
    logger.error({ err, userId: user.id }, "[notifications:GET]");
    return NextResponse.json(
      { error: "Unable to load notifications." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) {
    return createUnauthorizedResponse();
  }

  const parseResult = patchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.format() },
      { status: 400 }
    );
  }

  const body = parseResult.data;

  try {
    if (body.action === "read") {
      const notification = await prisma.notification.findUnique({
        where: { id: body.notificationId },
        select: { userId: true },
      });

      if (!notification || notification.userId !== user.id) {
        return NextResponse.json(
          { error: "Notification not found." },
          { status: 404 }
        );
      }

      await markNotificationRead(body.notificationId);
    } else if (body.action === "read_all") {
      await markAllNotificationsRead(user.id);
    } else if (body.action === "update_channels") {
      await prisma.notificationPreference.upsert({
        where: { userId: user.id },
        create: {
          emailEnabled: body.channels.includes("email"),
          inAppEnabled: body.channels.includes("in_app"),
          pushEnabled: body.channels.includes("push"),
          userId: user.id,
        },
        update: {
          emailEnabled: body.channels.includes("email"),
          inAppEnabled: body.channels.includes("in_app"),
          pushEnabled: body.channels.includes("push"),
        },
      });
    } else if (body.action === "update_type") {
      const field = preferenceMeta[body.preferenceId].field as PreferenceField;
      await prisma.notificationPreference.upsert({
        where: { userId: user.id },
        create: { userId: user.id, [field]: body.enabled },
        update: { [field]: body.enabled },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: user.id }, "[notifications:PATCH]");
    return NextResponse.json(
      { error: "Unable to update notifications." },
      { status: 500 }
    );
  }
}
