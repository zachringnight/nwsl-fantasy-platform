"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics/events";

export interface AnalyticsProviderProps {
  children: ReactNode;
}

/**
 * Tracks a `page_view` product event on every route change.
 *
 * `trackPageView` (see `src/lib/analytics/events.ts`) now dispatches
 * through the PostHog adapter and is a no-op when PostHog isn't
 * configured, so this component's behavior is unchanged from a caller's
 * perspective. Fantasy-identity lifecycle (identify on sign-in, reset on
 * sign-out) and Vercel Analytics/Speed Insights bootstrapping live in the
 * sibling `ProductAnalyticsProvider`, which wraps this component in
 * `src/app/layout.tsx`.
 */
export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const pathname = usePathname();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return <>{children}</>;
}
