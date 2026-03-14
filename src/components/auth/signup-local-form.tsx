"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chrome } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerLocalUser } from "@/lib/local-mode-store";

export function SignupLocalForm() {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, refreshProfile, supabaseReady } = useFantasyAuth();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
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

  async function handleGoogleSignup() {
    setError("");

    if (!supabaseReady) {
      setError("Google sign-up requires a hosted connection. Use the form above instead.");
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

  return (
    <form className="space-y-4" onSubmit={handleSignup}>
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
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button disabled={isSubmitting} fullWidth type="submit">
        {isSubmitting ? <Spinner /> : null}
        {isSubmitting ? "Creating account…" : "Get started"}
      </Button>
      <button
        className={getButtonClassName({ variant: "secondary", fullWidth: true })}
        onClick={handleGoogleSignup}
        type="button"
      >
        <Chrome className="size-4" />
        Continue with Google
      </button>
    </form>
  );
}
