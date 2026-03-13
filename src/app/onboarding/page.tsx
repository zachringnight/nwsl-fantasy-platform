import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { OnboardingLocalForm } from "@/components/auth/onboarding-local-form";
import { OnboardingLaunchSequence } from "@/features/onboarding/components/onboarding-launch-sequence";

const onboardingSteps = [
  "Pick a display name and favorite club",
  "Set your fantasy experience level",
  "Create or join your first league",
  "Start playing right away",
];

export default function OnboardingPage() {
  return (
    <AppShell
      eyebrow="Get started"
      title="Quick setup before your first league"
      description="Takes about 30 seconds."
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <OnboardingLaunchSequence steps={onboardingSteps} />

        <SurfaceCard
          eyebrow="Your setup"
          title="Save and continue"
          description="Pick your club and experience level, then jump straight into a league."
          tone="accent"
        >
          <OnboardingLocalForm />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
