"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type ReactNode } from "react";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import {
  identifyFantasyUser,
  resetFantasyIdentity,
} from "@/lib/analytics/events";

const VercelAnalytics = dynamic(
  () =>
    import("@vercel/analytics/next").then(
      ({ Analytics }) => Analytics
    ),
  { ssr: false }
);

const VercelSpeedInsights = dynamic(
  () =>
    import("@vercel/speed-insights/next").then(
      ({ SpeedInsights }) => SpeedInsights
    ),
  { ssr: false }
);

const vercelAnalyticsEnabled =
  process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED === "true";

interface IdentifiedUser {
  id: string;
  traitsSignature: string;
}

export interface ProductAnalyticsProviderProps {
  children: ReactNode;
}

export function ProductAnalyticsProvider({
  children,
}: ProductAnalyticsProviderProps) {
  const { hasHydrated, profile, user } = useFantasyAuth();
  const identifiedUser = useRef<IdentifiedUser | null>(null);
  const identityId = user?.id ?? profile?.user_id ?? null;
  const favoriteClub = profile?.favorite_club ?? undefined;
  const experienceLevel = profile?.experience_level ?? undefined;
  const traitsSignature = `${favoriteClub ?? ""}|${experienceLevel ?? ""}`;

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!identityId) {
      if (identifiedUser.current) {
        identifiedUser.current = null;
        resetFantasyIdentity();
      }
      return;
    }

    const previousIdentity = identifiedUser.current;

    if (previousIdentity && previousIdentity.id !== identityId) {
      resetFantasyIdentity();
    }

    if (
      previousIdentity?.id !== identityId ||
      previousIdentity.traitsSignature !== traitsSignature
    ) {
      identifyFantasyUser(identityId, {
        experienceLevel,
        favoriteClub,
      });
      identifiedUser.current = {
        id: identityId,
        traitsSignature,
      };
    }
  }, [
    experienceLevel,
    favoriteClub,
    hasHydrated,
    identityId,
    traitsSignature,
  ]);

  return (
    <>
      {children}
      {vercelAnalyticsEnabled ? (
        <>
          <VercelAnalytics />
          <VercelSpeedInsights />
        </>
      ) : null}
    </>
  );
}
