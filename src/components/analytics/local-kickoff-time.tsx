"use client";

import { useSyncExternalStore } from "react";

function formatLocalKickoff(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function subscribe() {
  return () => {};
}

export function LocalKickoffTime({
  value,
  fallback,
}: {
  value: string | null;
  fallback: string;
}) {
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const label = value && isHydrated ? formatLocalKickoff(value) : fallback;

  return value ? <time dateTime={value}>{label}</time> : <>{fallback}</>;
}
