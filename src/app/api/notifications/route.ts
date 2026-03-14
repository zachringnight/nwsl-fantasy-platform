import { NextRequest, NextResponse } from "next/server";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/notification-service";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function getBearerToken(request: NextRequest) {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new Error("Sign in before opening notifications.");
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

async function requireSignedInUser(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const accessToken = getBearerToken(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user || user.is_anonymous) {
    throw error ?? new Error("Sign in before opening notifications.");
  }

  return user;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  try {
    const user = await requireSignedInUser(request);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const rawLimit = Number(searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const notifications = await getUserNotifications(user.id, { limit, unreadOnly });

    return NextResponse.json({ notifications });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load notifications.";
    const status = message === "Sign in before opening notifications." ? 401 : 200;

    if (status === 401) {
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ notifications: [] });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSignedInUser(request);
    const body = (await request.json()) as {
      notificationId?: string;
      action: "read" | "read_all";
    };

    if (body.action === "read" && body.notificationId) {
      const updated = await markNotificationRead(body.notificationId, user.id);

      if (!updated) {
        return NextResponse.json({ error: "Notification not found." }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    }

    if (body.action === "read_all") {
      await markAllNotificationsRead(user.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update notifications.";
    const status = message === "Sign in before opening notifications." ? 401 : 200;

    if (status === 401) {
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ success: false });
  }
}
