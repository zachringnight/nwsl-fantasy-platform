"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { identifyFantasyUser, resetFantasyIdentity } from "@/lib/analytics/events";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";

export interface ProductAnalyticsProviderProps {
  children: ReactNode;
}

/**
 * App-root product analytics bootstrapping.
 *
 * - Mounts Vercel Web Analytics and Speed Insights once. Both components
 *   are safe no-ops until the corresponding feature is enabled for this
 *   project in the Vercel dashboard -- nothing extra to gate here.
 * - Syncs PostHog identity to the fantasy auth session: identifies a
 *   manager once their session resolves (see `identifyFantasyUser`), and
 *   resets identity on sign-out (see `resetFantasyIdentity`) so the next
 *   anonymous session doesn't inherit the previous manager's identity.
 *   Both calls are themselves no-ops when PostHog isn't configured.
 *
 * Must render inside `FantasyAuthProvider` (see `src/app/layout.tsx`) --
 * it reads the resolved session via `useFantasyAuth()`.
 */
export function ProductAnalyticsProvider({ children }: ProductAnalyticsProviderProps) {
  const { user, profile, hasHydrated } = useFantasyAuth();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;

    if (user) {
      if (identifiedUserId.current !== user.id) {
        identifiedUserId.current = user.id;
        identifyFantasyUser(user.id, {
          favoriteClub: profile?.favorite_club ?? undefined,
          experienceLevel: profile?.experience_level ?? undefined,
        });
      }
      return;
    }

    if (identifiedUserId.current !== null) {
      identifiedUserId.current = null;
      resetFantasyIdentity();
    }
  }, [hasHydrated, user, profile]);

  return (
    <>
      {children}
      <Analytics />
      <SpeedInsights />
    </>
  );
}
