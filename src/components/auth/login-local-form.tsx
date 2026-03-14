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

type LoginMode = "choice" | "email";

export function LoginLocalForm() {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, refreshProfile, supabaseReady } = useFantasyAuth();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>("choice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  if (!supabaseReady) {
    return (
      <EmptyState
        title="Sign-in temporarily unavailable"
        description="We're having trouble connecting right now. Please try again in a moment."
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

  async function handleGuestSession() {
    setError("");
    setIsSubmitting(true);

    try {
      await dataClient.ensureHostedSession();
      await refreshProfile();
      router.push("/onboarding");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to start your session."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function validateLoginFields(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Password is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleEmailLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!validateLoginFields()) return;
    setError("");
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw authError;
      }

      await refreshProfile();
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in. Check your credentials."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start Google sign-in."
      );
    }
  }

  if (loginMode === "email") {
    return (
      <form className="space-y-4" onSubmit={handleEmailLogin}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Email</span>
          <input
            className="field-control"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: undefined })); }}
            required
            autoFocus
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
          />
          {fieldErrors.email ? <span id="login-email-error" className="text-xs text-danger">{fieldErrors.email}</span> : null}
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Password</span>
          <input
            className="field-control"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, password: undefined })); }}
            required
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
          />
          {fieldErrors.password ? <span id="login-password-error" className="text-xs text-danger">{fieldErrors.password}</span> : null}
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button disabled={isSubmitting} fullWidth type="submit">
          {isSubmitting ? <Spinner /> : <Mail className="size-4" />}
          {isSubmitting ? "Signing in…" : "Sign in with email"}
        </Button>
        <button
          className={getButtonClassName({ variant: "ghost", fullWidth: true })}
          onClick={() => setLoginMode("choice")}
          type="button"
        >
          Back to options
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-line bg-panel-soft p-4 text-sm leading-6 text-muted">
        Sign in with your email and password, continue with Google, or start a quick guest session.
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="space-y-3">
        <Button
          fullWidth
          onClick={() => setLoginMode("email")}
          type="button"
        >
          <Mail className="size-4" />
          Sign in with email
        </Button>
        <button
          className={getButtonClassName({ variant: "secondary", fullWidth: true })}
          onClick={handleGoogleLogin}
          type="button"
        >
          <Chrome className="size-4" />
          Continue with Google
        </button>
        <button
          className={getButtonClassName({ variant: "ghost", fullWidth: true })}
          disabled={isSubmitting}
          onClick={handleGuestSession}
          type="button"
        >
          {isSubmitting ? "Starting session…" : "Quick guest session"}
        </button>
      </div>
    </div>
  );
}
