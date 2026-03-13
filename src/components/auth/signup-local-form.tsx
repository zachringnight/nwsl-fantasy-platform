"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chrome, Mail } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SignupMode = "choice" | "email" | "check_email";

export function SignupLocalForm() {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, refreshProfile, supabaseReady } = useFantasyAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupMode, setSignupMode] = useState<SignupMode>("choice");

  if (!supabaseReady) {
    return (
      <EmptyState
        title="Account creation unavailable"
        description="This environment is missing the account configuration required for signup."
      />
    );
  }

  if (!hasHydrated) {
    return (
      <EmptyState
        title="Checking your session"
        description="Looking for an existing account on this browser."
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

  async function handleGuestSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await dataClient.ensureHostedSession();
      await dataClient.upsertFantasyProfile({
        displayName,
        onboardingComplete: false,
      });
      await refreshProfile();
      router.push("/onboarding");
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

  async function handleEmailSignup(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (authError) {
        throw authError;
      }

      // If email confirmation is required, the session will be null
      if (!signUpData.session) {
        setSignupMode("check_email");
        return;
      }

      await dataClient.upsertFantasyProfile({
        displayName,
        onboardingComplete: false,
      });
      await refreshProfile();
      router.push("/onboarding");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create your account."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignup() {
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start Google sign-up."
      );
    }
  }

  if (signupMode === "check_email") {
    return (
      <div className="space-y-4">
        <div className="rounded-[1.4rem] border border-success/30 bg-success/8 p-4 text-sm leading-6 text-foreground">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-2 text-muted">
            We sent a confirmation link to <strong>{email}</strong>. Click the link
            to activate your account and continue to onboarding.
          </p>
        </div>
        <button
          className={getButtonClassName({ variant: "ghost", fullWidth: true })}
          onClick={() => setSignupMode("choice")}
          type="button"
        >
          Back to options
        </button>
      </div>
    );
  }

  if (signupMode === "email") {
    return (
      <form className="space-y-4" onSubmit={handleEmailSignup}>
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
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button disabled={isSubmitting} fullWidth type="submit">
          <Mail className="size-4" />
          {isSubmitting ? "Creating account…" : "Create account with email"}
        </Button>
        <button
          className={getButtonClassName({ variant: "ghost", fullWidth: true })}
          onClick={() => setSignupMode("choice")}
          type="button"
        >
          Back to options
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleGuestSignup}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Display name</span>
          <input
            className="field-control"
            type="text"
            placeholder="Rose City Press"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 space-y-3">
          <Button
            fullWidth
            onClick={() => setSignupMode("email")}
            type="button"
          >
            <Mail className="size-4" />
            Sign up with email
          </Button>
          <button
            className={getButtonClassName({ variant: "secondary", fullWidth: true })}
            onClick={handleGoogleSignup}
            type="button"
          >
            <Chrome className="size-4" />
            Continue with Google
          </button>
          <button
            className={getButtonClassName({ variant: "ghost", fullWidth: true })}
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Starting session…" : "Quick guest session"}
          </button>
        </div>
      </form>
    </div>
  );
}
