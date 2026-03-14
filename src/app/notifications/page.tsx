"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, CheckCheck, Mail, Smartphone } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";

type NotificationChannel = "in_app" | "email" | "push";

interface NotificationPreference {
  id: string;
  label: string;
  description: string;
  channels: NotificationChannel[];
}

interface InAppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

const defaultPreferences: NotificationPreference[] = [
  {
    id: "draft_turn",
    label: "Draft turn alerts",
    description: "Get notified when your draft pick is on deck.",
    channels: ["in_app", "email", "push"],
  },
  {
    id: "entry_lock",
    label: "Entry lock warnings",
    description: "15-minute warning before a salary-cap slate locks.",
    channels: ["in_app", "email", "push"],
  },
  {
    id: "waiver_result",
    label: "Waiver claim results",
    description: "Know immediately when a claim is won, lost, or canceled.",
    channels: ["in_app", "email"],
  },
  {
    id: "matchup_final",
    label: "Matchup final scores",
    description: "Get the final result when your weekly matchup settles.",
    channels: ["in_app", "email"],
  },
];

const channelIcons: Record<NotificationChannel, typeof Bell> = {
  in_app: Bell,
  email: Mail,
  push: Smartphone,
};

const channelLabels: Record<NotificationChannel, string> = {
  in_app: "In-app",
  email: "Email",
  push: "Push",
};

export default function NotificationsPage() {
  const { user } = useFantasyAuth();
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/notifications?userId=${user.id}&limit=20`);
      if (res.ok) {
        const data = (await res.json()) as { notifications: InAppNotification[] };
        setNotifications(data.notifications);
      }
    } catch {
      // Network error — keep existing state
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function markRead(notificationId: string) {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
      )
    );

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId, action: "read" }),
      });
    } catch {
      // Revert on failure
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, readAt: null } : n
        )
      );
    }
  }

  async function markAllRead() {
    if (!user?.id) return;

    const previousNotifications = notifications;
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
    );

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action: "read_all" }),
      });
    } catch {
      setNotifications(previousNotifications);
    }
  }

  function toggleChannel(prefId: string, channel: NotificationChannel) {
    setPreferences((prev) =>
      prev.map((pref) => {
        if (pref.id !== prefId) return pref;
        const hasChannel = pref.channels.includes(channel);
        return {
          ...pref,
          channels: hasChannel
            ? pref.channels.filter((c) => c !== channel)
            : [...pref.channels, channel],
        };
      })
    );
  }

  return (
    <FantasyAuthGate
      loadingTitle="Loading notifications"
      loadingDescription="Checking your account."
      signedOutTitle="Sign in to continue"
      signedOutDescription="Sign in to view and manage your notifications."
    >
      {() => (
    <AppShell
      eyebrow="Notifications"
      title="The alerts that matter, without the noise"
      description="See what happened and choose how you hear about it."
      actions={
        unreadCount > 0 ? (
          <Button variant="secondary" onClick={markAllRead}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <MetricTile
          label="Unread"
          value={unreadCount}
          detail="Notifications waiting for you."
          tone="brand"
        />
        <MetricTile
          label="Active channels"
          value={new Set(preferences.flatMap((p) => p.channels)).size}
          detail="Ways alerts reach you."
        />
        <MetricTile
          label="Alert types"
          value={preferences.length}
          detail="Things you can get alerted about."
          tone="accent"
        />
      </div>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="Recent alerts"
          title="Your notification feed"
          description="The most recent alerts from your leagues."
        >
          {isLoading ? (
            <p className="text-sm text-muted">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-muted">
              No notifications yet. They will appear here as your leagues progress.
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
                          {isUnread && (
                            <span className="mr-2 inline-block size-2 rounded-full bg-brand-strong" />
                          )}
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted">{notification.body}</p>
                        <p className="text-xs text-muted">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {isUnread && (
                        <button
                          aria-label={`Mark "${notification.title}" as read`}
                          className="rounded-full border border-line bg-white/6 p-1.5 text-muted transition hover:border-brand-strong/35 hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                          onClick={() => markRead(notification.id)}
                          title="Mark as read"
                          type="button"
                        >
                          <Check className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Preferences"
          title="Choose how each alert reaches you"
          description="Toggle delivery channels per notification type."
          tone="accent"
        >
          <div className="space-y-4">
            {preferences.map((pref) => (
              <div
                key={pref.id}
                className="rounded-[1.2rem] border border-line bg-white/6 p-4"
              >
                <p className="font-semibold text-foreground">{pref.label}</p>
                <p className="mt-1 text-sm text-muted">{pref.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["in_app", "email", "push"] as NotificationChannel[]).map(
                    (channel) => {
                      const Icon = channelIcons[channel];
                      const isActive = pref.channels.includes(channel);
                      return (
                        <button
                          key={channel}
                          aria-label={`${isActive ? "Disable" : "Enable"} ${channelLabels[channel]} for ${pref.label}`}
                          aria-pressed={isActive}
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55",
                            isActive
                              ? "border-brand bg-brand/15 text-brand-strong"
                              : "border-line bg-white/4 text-muted hover:border-brand-strong/25",
                          ].join(" ")}
                          onClick={() => toggleChannel(pref.id, channel)}
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
                    }
                  )}
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
      )}
    </FantasyAuthGate>
  );
}
