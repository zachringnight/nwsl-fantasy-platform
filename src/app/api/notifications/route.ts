import { NextResponse } from "next/server";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/notification-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Number(searchParams.get("limit") ?? 20);

  const notifications = await getUserNotifications(userId, { limit, unreadOnly });

  return NextResponse.json({ notifications });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    notificationId?: string;
    userId?: string;
    action: "read" | "read_all";
  };

  if (body.action === "read" && body.notificationId) {
    await markNotificationRead(body.notificationId);
    return NextResponse.json({ success: true });
  }

  if (body.action === "read_all" && body.userId) {
    await markAllNotificationsRead(body.userId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
