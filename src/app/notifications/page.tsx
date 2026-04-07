"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Mail,
  Smartphone,
} from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { getSupabaseAccessToken } from "@/lib/supabase/client";

type NotificationChannel = "email" | "in_app" | "push";
type NotificationPreferenceId =
  | "draft_turn"
  | "entry_lock"
  | "matchup_final"
  | "waiver_result";

interface DeliveryChannelState {
  email: boolean;
  in_app: boolean;
  push: boolean;
}

interface NotificationPreference {
  description: string;
  enabled: boolean;
  id: NotificationPreferenceId;
  label: string;
}

interface InAppNotification {
  body: string;
  createdAt: string;
  id: string;
  readAt: string | null;
  title: string;
}

interface NotificationsResponse {
  alertPreferences: NotificationPreference[];
  deliveryChannels: DeliveryChannelState;
  notifications: InAppNotification[];
  unreadCount: number;
}

const channelIcons: Record<NotificationChannel, typeof Bell> = {
  email: Mail,
  in_app: Bell,
  push: Smartphone,
};

const channelLabels: Record<NotificationChannel, string> = {
  email: "Email",
  in_app: "In-app",
  push: "Push",
};

const notificationChannels = [
  "in_app",
  "email",
  "push",
] as const satisfies NotificationChannel[];

async function buildAuthHeaders() {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    throw new Error("Your session expired. Sign in again to update notifications.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export default function NotificationsPage() {
  const { user } = useFantasyAuth();
  const [deliveryChannels, setDeliveryChannels] = useState<DeliveryChannelState>({
    email: true,
    in_app: true,
    push: false,
  });
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch("/api/notifications?limit=20", { headers });

      if (!res.ok) {
        throw new Error("Unable to load notifications.");
      }

      const data = (await res.json()) as NotificationsResponse;
      setDeliveryChannels(data.deliveryChannels);
      setNotifications(data.notifications);
      setPreferences(data.alertPreferences);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error("[notifications] Failed to load notification center:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  async function markRead(notificationId: string) {
    const readAt = new Date().toISOString();

    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, readAt }
          : notification
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch("/api/notifications", {
        body: JSON.stringify({ action: "read", notificationId }),
        headers,
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Unable to mark the notification as read.");
      }
    } catch (err) {
      console.error("[notifications] Failed to mark as read:", err);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: null }
            : notification
        )
      );
      setUnreadCount((prev) => prev + 1);
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) {
      return;
    }

    const previousNotifications = notifications;
    setNotifications((prev) =>
      prev.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      }))
    );
    setUnreadCount(0);

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch("/api/notifications", {
        body: JSON.stringify({ action: "read_all" }),
        headers,
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Unable to mark all notifications as read.");
      }
    } catch (err) {
      console.error("[notifications] Failed to mark all as read:", err);
      setNotifications(previousNotifications);
      setUnreadCount(previousNotifications.filter((item) => !item.readAt).length);
    }
  }

  async function toggleChannel(channel: NotificationChannel) {
    const previousChannels = deliveryChannels;
    const nextChannels: DeliveryChannelState = {
      ...deliveryChannels,
      [channel]: !deliveryChannels[channel],
    };

    setDeliveryChannels(nextChannels);

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch("/api/notifications", {
        body: JSON.stringify({
          action: "update_channels",
          channels: notificationChannels.filter(
            (value) => nextChannels[value]
          ),
        }),
        headers,
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Unable to update notification channels.");
      }
    } catch (err) {
      console.error("[notifications] Failed to save channel settings:", err);
      setDeliveryChannels(previousChannels);
    }
  }

  async function togglePreference(preferenceId: NotificationPreferenceId) {
    const previousPreferences = preferences;
    const nextPreferences = preferences.map((preference) =>
      preference.id === preferenceId
        ? { ...preference, enabled: !preference.enabled }
        : preference
    );
    const targetPreference = nextPreferences.find(
      (preference) => preference.id === preferenceId
    );

    setPreferences(nextPreferences);

    try {
      const headers = await buildAuthHeaders();
      const res = await fetch("/api/notifications", {
        body: JSON.stringify({
          action: "update_type",
          enabled: targetPreference?.enabled ?? true,
          preferenceId,
        }),
        headers,
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Unable to update the notification preference.");
      }
    } catch (err) {
      console.error("[notifications] Failed to save preference:", err);
      setPreferences(previousPreferences);
    }
  }

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account."
      loadingTitle="Loading notifications"
      signedOutDescription="Sign in to view and manage your notifications."
      signedOutTitle="Sign in to continue"
    >
      {() => (
        <AppShell
          eyebrow="Notifications"
          title="The alerts that matter, without the noise"
          description="See what happened and choose how you hear about it."
          actions={
            unreadCount > 0 ? (
              <Button onClick={markAllRead} variant="secondary">
                <CheckCheck className="size-4" />
                Mark all read
              </Button>
            ) : undefined
          }
        >
          <div className="grid gap-5 sm:grid-cols-3">
            <MetricTile
              detail="Notifications waiting for you."
              label="Unread"
              tone="brand"
              value={unreadCount}
            />
            <MetricTile
              detail="Ways alerts can reach you."
              label="Active channels"
              value={notificationChannels.filter((channel) => deliveryChannels[channel]).length}
            />
            <MetricTile
              detail="Alert types you currently allow."
              label="Enabled alerts"
              tone="accent"
              value={preferences.filter((preference) => preference.enabled).length}
            />
          </div>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <SurfaceCard
              description="The most recent alerts from your leagues."
              eyebrow="Recent alerts"
              title="Your notification feed"
            >
              {isLoading ? (
                <p className="text-sm text-muted">Loading notifications…</p>
              ) : notifications.length === 0 ? (
                <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-muted">
                  All caught up. You&apos;ll see alerts here when something needs
                  your attention.
                </p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notification) => {
                    const isUnread = !notification.readAt;

                    return (
                      <div
                        key={notification.id}
                        className={[
                          "rounded-[1.2rem] border p-4 transition",
                          isUnread
                            ? "border-brand/30 bg-brand/8"
                            : "border-line bg-white/4",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold text-foreground">
                              {isUnread ? (
                                <span className="mr-2 inline-block size-2 rounded-full bg-brand-strong" />
                              ) : null}
                              {notification.title}
                            </p>
                            <p className="text-sm text-muted">
                              {notification.body}
                            </p>
                            <p className="text-xs text-muted">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {isUnread ? (
                            <button
                              aria-label={`Mark "${notification.title}" as read`}
                              className="rounded-full border border-line bg-white/6 p-1.5 text-muted transition hover:border-brand-strong/35 hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                              onClick={() => markRead(notification.id)}
                              title="Mark as read"
                              type="button"
                            >
                              <Check className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard
              description="Set your default delivery channels and pause alert types you do not need."
              eyebrow="Preferences"
              title="Choose how alerts reach you"
              tone="accent"
            >
              <div className="space-y-5">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Delivery channels
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {notificationChannels.map((channel) => {
                      const Icon = channelIcons[channel];
                      const isActive = deliveryChannels[channel];

                      return (
                        <button
                          key={channel}
                          aria-label={`${isActive ? "Disable" : "Enable"} ${channelLabels[channel]} notifications`}
                          aria-pressed={isActive}
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55",
                            isActive
                              ? "border-brand bg-brand/15 text-brand-strong"
                              : "border-line bg-white/4 text-muted hover:border-brand-strong/25",
                          ].join(" ")}
                          onClick={() => toggleChannel(channel)}
                          type="button"
                        >
                          {isActive ? (
                            <Icon className="size-3.5" />
                          ) : (
                            <BellOff className="size-3.5" />
                          )}
                          {channelLabels[channel]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Alert types
                  </p>
                  {preferences.map((preference) => (
                    <div
                      key={preference.id}
                      className="rounded-[1.2rem] border border-line bg-white/6 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">
                            {preference.label}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {preference.description}
                          </p>
                        </div>
                        <button
                          aria-label={`${preference.enabled ? "Pause" : "Enable"} ${preference.label}`}
                          aria-pressed={preference.enabled}
                          className={[
                            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55",
                            preference.enabled
                              ? "border-brand bg-brand/15 text-brand-strong"
                              : "border-line bg-white/4 text-muted hover:border-brand-strong/25",
                          ].join(" ")}
                          onClick={() => togglePreference(preference.id)}
                          type="button"
                        >
                          {preference.enabled ? "Enabled" : "Paused"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SurfaceCard>
          </section>
        </AppShell>
      )}
    </FantasyAuthGate>
  );
}
