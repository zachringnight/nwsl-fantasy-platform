"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chrome, Mail } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerLocalUser } from "@/lib/local-mode-store";

type SignupMode = "choice" | "email" | "verify";

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
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; email?: string; password?: string }>({});

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

  async function handleGuestSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    setError("");
    setIsSubmitting(true);

    try {
      if (!supabaseReady) {
        registerLocalUser({ displayName: displayName.trim(), email: "" });
        await refreshProfile();
        router.push("/onboarding");
        return;
      }
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

  function validateSignupFields(): boolean {
    const errors: { displayName?: string; email?: string; password?: string } = {};
    if (!displayName.trim()) errors.displayName = "Display name is required.";
    if (!email.trim()) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Password is required.";
    else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleEmailSignup(event: React.FormEvent) {
    event.preventDefault();
    if (!validateSignupFields()) return;
    setError("");
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      if (!supabaseReady) {
        registerLocalUser({ displayName: displayName.trim(), email: email.trim() });
        await refreshProfile();
        router.push("/onboarding");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName },
        },
      });

      if (authError) {
        throw authError;
      }

      // If Supabase returned a session, the project doesn't require
      // email confirmation — continue directly.
      if (signUpData.session) {
        await dataClient.upsertFantasyProfile({
          displayName,
          onboardingComplete: false,
        });
        await refreshProfile();
        router.push("/onboarding");
      } else {
        // Email confirmation required — show verification message
        setSignupMode("verify");
      }
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

    if (!supabaseReady) {
      setError("Google sign-up requires a hosted connection. Use email or guest sign-up instead.");
      return;
    }

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

  if (signupMode === "verify") {
    return (
      <div className="space-y-4">
        <div className="rounded-[1.4rem] border border-brand/30 bg-brand/8 p-4 text-sm leading-6 text-foreground">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1 text-muted">
            We sent a confirmation link to <strong>{email}</strong>. Click the link in the email to activate your account, then come back here to sign in.
          </p>
        </div>
        <Link
          href="/login"
          className={getButtonClassName({ fullWidth: true })}
        >
          Go to sign in
        </Link>
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
            onChange={(e) => { setDisplayName(e.target.value); setFieldErrors((prev) => ({ ...prev, displayName: undefined })); }}
            required
            autoFocus
            aria-invalid={!!fieldErrors.displayName}
            aria-describedby={fieldErrors.displayName ? "signup-name-error" : undefined}
          />
          {fieldErrors.displayName ? <span id="signup-name-error" className="text-xs text-danger">{fieldErrors.displayName}</span> : null}
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Email</span>
          <input
            className="field-control"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: undefined })); }}
            required
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
          />
          {fieldErrors.email ? <span id="signup-email-error" className="text-xs text-danger">{fieldErrors.email}</span> : null}
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Password</span>
          <input
            className="field-control"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, password: undefined })); }}
            required
            minLength={8}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "signup-password-error" : undefined}
          />
          {fieldErrors.password ? <span id="signup-password-error" className="text-xs text-danger">{fieldErrors.password}</span> : null}
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button disabled={isSubmitting} fullWidth type="submit">
          {isSubmitting ? <Spinner /> : <Mail className="size-4" />}
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
          <Button disabled={isSubmitting} fullWidth type="submit">
            {isSubmitting ? <Spinner /> : null}
            {isSubmitting ? "Creating account…" : "Get started"}
          </Button>
          <button
            className={getButtonClassName({ variant: "secondary", fullWidth: true })}
            onClick={() => setSignupMode("email")}
            type="button"
          >
            <Mail className="size-4" />
            Sign up with email
          </button>
          <button
            className={getButtonClassName({ variant: "secondary", fullWidth: true })}
            onClick={handleGoogleSignup}
            type="button"
          >
            <Chrome className="size-4" />
            Continue with Google
          </button>
        </div>
      </form>
    </div>
  );
}
