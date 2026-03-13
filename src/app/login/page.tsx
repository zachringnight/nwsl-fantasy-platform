import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { LoginLocalForm } from "@/components/auth/login-local-form";
import { getButtonClassName } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <AppShell
      eyebrow="Sign in"
      title="Sign in fast and get back to your leagues"
      description="Sign in, recover your account if needed, and get back to your leagues."
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
        <SurfaceCard
          eyebrow="Primary flow"
          title="Sign in"
          description="Enter your details and go straight back to your leagues."
        >
          <LoginLocalForm />
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Alternates"
          title="Need a different path?"
          description="Create a new account or send yourself a recovery link."
          tone="accent"
        >
          <div className="space-y-3 text-sm text-foreground">
            <Link href="/signup" className={getButtonClassName({ className: "w-full", variant: "secondary" })}>
              Create account
            </Link>
            <Link href="/forgot-password" className={getButtonClassName({ className: "w-full", variant: "ghost" })}>
              Send recovery link
            </Link>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
