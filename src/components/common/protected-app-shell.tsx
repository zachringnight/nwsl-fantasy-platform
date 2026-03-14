"use client";

import Link from "next/link";
import { AppShell, type AppShellProps } from "@/components/common/app-shell";
import { getButtonClassName } from "@/components/ui/button";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";

export interface ProtectedAppShellProps extends AppShellProps {
  onboardingDescription?: string;
  onboardingTitle?: string;
  requireOnboarding?: boolean;
  signedOutDescription: string;
  signedOutTitle: string;
}

export function ProtectedAppShell({
  actions,
  children,
  description,
  eyebrow,
  onboardingDescription,
  onboardingTitle,
  requireOnboarding = true,
  signedOutDescription,
  signedOutTitle,
  title,
}: ProtectedAppShellProps) {
  return (
    <AppShell
      actions={actions}
      description={description}
      eyebrow={eyebrow}
      title={title}
    >
      <FantasyAuthGate
        loadingDescription="Checking your account access."
        loadingTitle="Checking your account"
        onboardingAction={
          <Link className={getButtonClassName()} href="/onboarding">
            Finish onboarding
          </Link>
        }
        onboardingDescription={onboardingDescription}
        onboardingTitle={onboardingTitle}
        requireOnboarding={requireOnboarding}
        signedOutAction={
          <Link className={getButtonClassName()} href="/signup">
            Create account
          </Link>
        }
        signedOutDescription={signedOutDescription}
        signedOutTitle={signedOutTitle}
      >
        {() => <>{children}</>}
      </FantasyAuthGate>
    </AppShell>
  );
}
