"use client";

import { useState } from "react";
import { Bell, BellOff, Check, CheckCheck, Mail, Smartphone } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";

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
  read: boolean;
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

const mockNotifications: InAppNotification[] = [
  {
    id: "n-1",
    title: "Draft pick #4 is on deck",
    body: "Your turn to pick in Rose City Press. The clock is running.",
    read: false,
    createdAt: "2026-03-13T15:30:00Z",
  },
  {
    id: "n-2",
    title: "Waiver claim won — Sophia Smith",
    body: "Your claim for Sophia Smith in Rose City Press was successful.",
    read: false,
    createdAt: "2026-03-13T08:00:00Z",
  },
  {
    id: "n-3",
    title: "Matchup final — 84.2 to 71.8",
    body: "You won your matchup against Portland Thorns FC Fan League.",
    read: true,
    createdAt: "2026-03-12T22:00:00Z",
  },
  {
    id: "n-4",
    title: "Weekly slate locks in 15 minutes",
    body: "Make your final salary-cap edits before the window closes.",
    read: true,
    createdAt: "2026-03-12T17:45:00Z",
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
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;

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

  function markRead(notificationId: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <AppShell
      eyebrow="Notifications"
      title="The alerts that matter, without the noise"
      description="Configure delivery channels for each notification type and view your recent alerts."
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
          detail="Delivery methods enabled."
        />
        <MetricTile
          label="Alert types"
          value={preferences.length}
          detail="Configurable notification triggers."
          tone="accent"
        />
      </div>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="Recent alerts"
          title="Your notification feed"
          description="The most recent alerts from your leagues."
        >
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={[
                  "rounded-[1.2rem] border p-4 transition",
                  notification.read
                    ? "border-line bg-white/4"
                    : "border-brand/30 bg-brand/8",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">
                      {!notification.read && (
                        <span className="mr-2 inline-block size-2 rounded-full bg-brand-strong" />
                      )}
                      {notification.title}
                    </p>
                    <p className="text-sm text-muted">{notification.body}</p>
                    <p className="text-xs text-muted">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notification.read && (
                    <button
                      className="rounded-full border border-line bg-white/6 p-1.5 text-muted transition hover:border-brand-strong/35 hover:text-brand-strong"
                      onClick={() => markRead(notification.id)}
                      title="Mark as read"
                      type="button"
                    >
                      <Check className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition",
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
  );
}
