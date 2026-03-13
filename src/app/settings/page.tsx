import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

export default function SettingsPage() {
  return (
    <AppShell
      eyebrow="Account"
      title="Manage your profile, recovery, and league preferences"
      description="Use this hub to update your account details and jump to the settings that already control league play."
    >
      <section className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="Profile"
          title="Keep your fantasy identity up to date"
          description="Set your display name, favorite club, and experience level so every league reads cleanly from the first invite onward."
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
          eyebrow="Recovery and rules"
          title="Keep access and league context close"
          description="If you need help getting back in or checking a scoring question, the right path is one tap away."
          tone="accent"
        >
          <div className="flex flex-wrap gap-3">
            <Link href="/forgot-password" className="rounded-full bg-night px-4 py-2 text-sm font-semibold text-foreground">
              Reset password
            </Link>
            <Link href="/rules" className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground">
              Review scoring
            </Link>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
