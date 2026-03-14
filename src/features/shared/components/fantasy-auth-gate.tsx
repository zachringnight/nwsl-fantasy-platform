"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/common/empty-state";
import {
  useFantasyAuth,
  type FantasyAuthContextValue,
} from "@/components/providers/fantasy-auth-provider";

type ReadyFantasyAuthContext = FantasyAuthContextValue & {
  profile: NonNullable<FantasyAuthContextValue["profile"]>;
  session: NonNullable<FantasyAuthContextValue["session"]>;
};

export interface FantasyAuthGateProps {
  children: (context: ReadyFantasyAuthContext) => ReactNode;
  loadingDescription: string;
  loadingTitle: string;
  onboardingAction?: ReactNode;
  onboardingDescription?: string;
  onboardingTitle?: string;
  requireOnboarding?: boolean;
  signedOutAction?: ReactNode;
  signedOutDescription: string;
  signedOutTitle: string;
  unavailableDescription?: string;
  unavailableTitle?: string;
}

export function FantasyAuthGate({
  children,
  loadingDescription,
  loadingTitle,
  onboardingAction,
  onboardingDescription = "Finish onboarding before using this screen.",
  onboardingTitle = "Finish onboarding first",
  requireOnboarding = true,
  signedOutAction,
  signedOutDescription,
  signedOutTitle,
  unavailableDescription = "Account services are temporarily unavailable. Try again in a moment.",
  unavailableTitle = "Something went wrong",
}: FantasyAuthGateProps) {
  const auth = useFantasyAuth();

  if (!auth.supabaseReady) {
    return (
      <EmptyState
        action={signedOutAction}
        description={unavailableDescription}
        title={unavailableTitle}
      />
    );
  }

  if (!auth.hasHydrated) {
    return <EmptyState description={loadingDescription} title={loadingTitle} />;
  }

  if (!auth.session) {
    return (
      <EmptyState
        action={signedOutAction}
        description={signedOutDescription}
        title={signedOutTitle}
      />
    );
  }

  if (!auth.profile) {
    return (
      <EmptyState
        description="Preparing your account for the first time."
        title="Finishing account setup"
      />
    );
  }

  if (requireOnboarding && !auth.profile.onboarding_complete) {
    return (
      <EmptyState
        action={onboardingAction}
        description={onboardingDescription}
        title={onboardingTitle}
      />
    );
  }

  return <>{children(auth as ReadyFantasyAuthContext)}</>;
}
