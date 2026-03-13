import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { SignupLocalForm } from "@/components/auth/signup-local-form";
import { getButtonClassName } from "@/components/ui/button";

export default function SignupPage() {
  return (
    <AppShell
      eyebrow="Create account"
      title="Create your account and get to kickoff"
      description="Create your account, pick your club, and get into a league."
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
        <SurfaceCard
          eyebrow="Create account"
          title="Start with the essentials"
          description="Add the basics now, then finish your preferences on the next screen."
        >
          <SignupLocalForm />
        </SurfaceCard>

        <SurfaceCard
          eyebrow="What happens next"
          title="Next: club, experience, next move"
          description="Next you will choose your club, set your experience level, and decide whether to create or join a league."
          tone="accent"
        >
          <Link href="/onboarding" className={getButtonClassName({ variant: "secondary" })}>
            Preview onboarding
          </Link>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
