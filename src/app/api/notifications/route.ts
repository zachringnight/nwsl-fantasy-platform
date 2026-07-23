import { NextResponse } from "next/server";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  sendNotification,
  type NotificationPayload,
} from "@/lib/notifications/notification-service";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);

  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({
      notifications: [],
      unavailable: "Notifications are unavailable until Supabase is configured.",
    });
  }

  try {
    const notifications = await getUserNotifications(userId, { limit, unreadOnly });
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      { error: "Notifications are unavailable until Supabase is configured." },
      { status: 503 }
    );
  }

  try {
    const payload = (await request.json()) as NotificationPayload;

    if (
      !payload.userId ||
      !payload.type ||
      !payload.title ||
      !payload.body ||
      !Array.isArray(payload.channels)
    ) {
      return NextResponse.json(
        { error: "Invalid notification payload." },
        { status: 400 }
      );
    }

    await sendNotification(payload);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Unable to create notification." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      { error: "Notifications are unavailable until Supabase is configured." },
      { status: 503 }
    );
  }

  let body: { notificationId?: string; userId?: string; action?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.action === "read" && body.notificationId) {
      await markNotificationRead(body.notificationId);
      return NextResponse.json({ success: true });
    }

    if (body.action === "read_all" && body.userId) {
      await markAllNotificationsRead(body.userId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  }
}
