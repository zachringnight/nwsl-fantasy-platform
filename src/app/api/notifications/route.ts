import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorized } from "@/lib/api-helpers";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/notification-service";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  // Always use the authenticated user's ID — never trust a query param.
  const userId = user.id;

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);

  try {
    const notifications = await getUserNotifications(userId, { limit, unreadOnly });
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  let body: { notificationId?: string; action?: string };

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

    if (body.action === "read_all") {
      await markAllNotificationsRead(user.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  }
}
