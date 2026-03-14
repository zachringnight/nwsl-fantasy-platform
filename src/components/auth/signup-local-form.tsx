"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import {
  normalizeFantasyDisplayName,
  normalizeFantasyEmail,
  validateFantasyPassword,
} from "@/lib/fantasy-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignupLocalForm() {
  const router = useRouter();
  const { authError, hasHydrated, profile, refreshProfile, session, supabaseReady } = useFantasyAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!supabaseReady || authError) {
    return (
      <EmptyState
        title="Sign-up temporarily unavailable"
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
        title="Account already started"
        description="Continue the flow instead of creating a second profile on this browser."
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

  async function handleEmailSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const normalizedDisplayName = normalizeFantasyDisplayName(displayName);
      const normalizedEmail = normalizeFantasyEmail(email);
      validateFantasyPassword(password);
      setIsSubmitting(true);
      const supabase = getSupabaseBrowserClient();

      if (session?.user.is_anonymous) {
        await supabase.auth.signOut();
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: normalizedDisplayName,
          email: normalizedEmail,
          password,
        }),
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Unable to create your account.");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      const nextProfile = await refreshProfile();
      router.push(nextProfile?.onboarding_complete ? "/dashboard" : "/onboarding");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create your account."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" noValidate onSubmit={handleEmailSignup}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Display name</span>
        <input
          className="field-control"
          type="text"
          placeholder="Rose City Press"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          autoFocus
          autoComplete="nickname"
          aria-invalid={Boolean(error)}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Email</span>
        <input
          className="field-control"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          aria-invalid={Boolean(error)}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Password</span>
        <input
          className="field-control"
          type="password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
        />
      </label>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <Button disabled={isSubmitting} fullWidth type="submit">
        <Mail className="size-4" />
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm leading-6 text-muted">
        Already have an account?{" "}
        <Link className="font-semibold text-brand hover:text-brand-strong" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
