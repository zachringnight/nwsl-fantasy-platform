"use client";

import type { NotificationPayload } from "./notification-service";

export async function queueNotification(
  payload: NotificationPayload
): Promise<void> {
  const response = await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Unable to queue notification.");
  }
}
