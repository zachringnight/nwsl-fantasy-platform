import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  return (
    <AppShell
      eyebrow="Recovery"
      title="Get back into your account"
      description="Enter the email tied to your profile and we will send you a fresh sign-in link."
    >
      <SurfaceCard
        eyebrow="Email sign-in"
        title="Request a new magic link"
        description="Use the same email you use for fantasy leagues, draft rooms, and salary-cap entries."
      >
        <form className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Email address</span>
            <input className="field-control" type="email" placeholder="you@example.com" />
          </label>
          <Button type="submit">Send magic link</Button>
        </form>
      </SurfaceCard>
    </AppShell>
  );
}
