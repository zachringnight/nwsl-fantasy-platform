import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { LoginLocalForm } from "@/components/auth/login-local-form";
import { getButtonClassName } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <AppShell
      eyebrow="Sign in"
      title="Welcome back"
      description="Sign in and pick up where you left off."
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
        <SurfaceCard
          eyebrow="Sign in"
          title="Sign in"
          description="Enter your details to continue."
        >
          <LoginLocalForm />
        </SurfaceCard>

        <SurfaceCard
          eyebrow="New here?"
          title="Need an account?"
          description="Create a new account to get started."
          tone="accent"
        >
          <div className="space-y-3 text-sm text-foreground">
            <Link href="/signup" className={getButtonClassName({ className: "w-full", variant: "secondary" })}>
              Create account
            </Link>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
