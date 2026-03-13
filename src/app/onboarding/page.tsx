import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { OnboardingLocalForm } from "@/components/auth/onboarding-local-form";
import { OnboardingLaunchSequence } from "@/features/onboarding/components/onboarding-launch-sequence";

const onboardingSteps = [
  "Choose a display name and favorite club",
  "Pick your fantasy experience level",
  "Choose whether to create or join a league",
  "Land in the right next action without a dead end",
];

export default function OnboardingPage() {
  return (
    <AppShell
      eyebrow="Onboarding"
      title="Set your club, your comfort level, and your next move"
      description="Tell us who you support, how much fantasy you play, and what you want to do next."
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <OnboardingLaunchSequence steps={onboardingSteps} />

        <SurfaceCard
          eyebrow="Your setup"
          title="Save preferences and continue"
          description="Choose your club, tell us your experience level, and decide whether to create or join a league."
          tone="accent"
        >
          <OnboardingLocalForm />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
