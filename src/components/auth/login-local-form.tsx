"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { normalizeFantasyEmail, validateFantasyPassword } from "@/lib/fantasy-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginLocalForm() {
  const router = useRouter();
  const { authError, hasHydrated, profile, refreshProfile, session, supabaseReady } = useFantasyAuth();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!supabaseReady || authError) {
    return (
      <EmptyState
        title="Sign-in temporarily unavailable"
        description={authError ?? "We're having trouble connecting right now. Please try again in a moment."}
      />
    );
  }

  if (!hasHydrated) {
    return (
      <EmptyState
        title="One moment"
        description="Checking if you are already signed in."
      />
    );
  }

  if (profile) {
    return (
      <EmptyState
        title="You are already signed in"
        description="Continue from the point where you left off."
        action={
          <Link
            href={profile.onboarding_complete ? "/dashboard" : "/onboarding"}
            className={getButtonClassName()}
          >
            Continue
          </Link>
        }
      />
    );
  }

  async function handleEmailLogin(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const normalizedEmail = normalizeFantasyEmail(email);
      validateFantasyPassword(password);
      const supabase = getSupabaseBrowserClient();

      if (session?.user.is_anonymous) {
        await supabase.auth.signOut();
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        throw authError;
      }

      const nextProfile = await refreshProfile();
      router.push(nextProfile?.onboarding_complete ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in. Check your credentials."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" noValidate onSubmit={handleEmailLogin}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Email</span>
        <input
          className="field-control"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          aria-invalid={Boolean(error)}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Password</span>
        <input
          className="field-control"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          aria-invalid={Boolean(error)}
        />
      </label>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <Button disabled={isSubmitting} fullWidth type="submit">
        <Mail className="size-4" />
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex flex-wrap gap-3 text-sm leading-6 text-muted">
        <span>Need an account?</span>
        <Link className="font-semibold text-brand hover:text-brand-strong" href="/signup">
          Create one
        </Link>
      </div>
    </form>
  );
}
