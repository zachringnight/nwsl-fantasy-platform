import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

export default function SettingsPage() {
  return (
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
          eyebrow="Security & rules"
          title="Password and scoring"
          description="Reset your password or check how points are awarded."
          tone="accent"
        >
          <div className="flex flex-wrap gap-3">
            <Link href="/forgot-password" className="rounded-full bg-night px-4 py-2 text-sm font-semibold text-foreground">
              Reset password
            </Link>
            <Link href="/rules" className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground">
              Scoring rules
            </Link>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
