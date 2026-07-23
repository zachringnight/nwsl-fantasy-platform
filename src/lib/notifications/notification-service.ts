import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sendEmail } from "./email";

export type DeliveryChannel = "in_app" | "email" | "push";
export type NotificationType =
  | "DRAFT_STARTING"
  | "LINEUP_LOCK"
  | "WAIVER_PROCESSED"
  | "MATCHUP_RESULT"
  | "COMMISSIONER_ANNOUNCEMENT"
  | "TRADE_PROPOSED"
  | "TRADE_RESPONDED";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  leagueId?: string;
  channels: DeliveryChannel[];
  emailPayload?: EmailPayload;
}

export interface UserNotification {
  id: string;
  userId: string;
  leagueId: string | null;
  type: NotificationType;
  channel: DeliveryChannel;
  title: string;
  body: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

async function createNotificationRow(
  payload: NotificationPayload,
  channel: DeliveryChannel,
  sentAt: string | null
) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("fantasy_notifications").insert({
    user_id: payload.userId,
    league_id: payload.leagueId ?? null,
    type: payload.type,
    channel,
    title: payload.title,
    body: payload.body,
    sent_at: sentAt,
  });

  if (error) throw error;
}

export async function sendNotification(
  payload: NotificationPayload
): Promise<void> {
  const tasks: Promise<void>[] = [];
  const sentAt = new Date().toISOString();

  if (payload.channels.includes("in_app")) {
    tasks.push(createNotificationRow(payload, "in_app", sentAt));
  }

  if (payload.channels.includes("email") && payload.emailPayload?.to) {
    tasks.push(
      (async () => {
        await createNotificationRow(payload, "email", sentAt);
        await sendEmail(payload.emailPayload!);
      })()
    );
  }

  if (payload.channels.includes("push")) {
    // Push subscriptions are not part of the launch schema yet. Recording the
    // queued channel keeps the user-visible audit trail honest.
    tasks.push(createNotificationRow(payload, "push", null));
  }

  const results = await Promise.allSettled(tasks);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (failures.length === results.length && failures.length > 0) {
    throw failures[0].reason;
  }
}

export async function getUserNotifications(
  userId: string,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<UserNotification[]> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("fantasy_notifications")
    .select(
      "id, user_id, league_id, type, channel, title, body, sent_at, read_at, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 20);

  if (options?.unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    leagueId: (row.league_id as string | null) ?? null,
    type: row.type as NotificationType,
    channel: row.channel as DeliveryChannel,
    title: (row.title as string | null) ?? "Fantasy update",
    body: (row.body as string | null) ?? "",
    sentAt: (row.sent_at as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("fantasy_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("fantasy_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}
