"use client";

import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";

export default function SettingsPage() {
  return (
    <FantasyAuthGate
      loadingTitle="Loading settings"
      loadingDescription="Checking your account."
      signedOutTitle="Sign in to continue"
      signedOutDescription="Sign in to view your account settings."
    >
      {() => (
        <AppShell
          eyebrow="Account"
          title="Your profile and account settings"
          description="Update your details, reset your password, or review scoring rules."
        >
          <section className="grid gap-5 lg:grid-cols-2">
            <SurfaceCard
              eyebrow="Profile"
              title="Update your identity"
              description="Change your display name, favorite club, or experience level."
            >
              <div className="flex flex-wrap gap-3">
                <Link href="/onboarding" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
                  Update profile
                </Link>
                <Link href="/dashboard" className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground">
                  Open dashboard
                </Link>
              </div>
            </SurfaceCard>
            <SurfaceCard
              eyebrow="Rules"
              title="Scoring"
              description="Check how points are awarded."
              tone="accent"
            >
              <div className="flex flex-wrap gap-3">
                <Link href="/rules" className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground">
                  Scoring rules
                </Link>
              </div>
            </SurfaceCard>
          </section>
        </AppShell>
      )}
    </FantasyAuthGate>
  );
}
