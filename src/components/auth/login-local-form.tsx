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

export function LoginLocalForm() {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, refreshProfile, supabaseReady } = useFantasyAuth();
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
      if (!supabaseReady) {
        registerLocalUser({ displayName: "Guest", email: "" });
        await refreshProfile();
        router.push("/onboarding");
        return;
      }
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

  async function handleGoogleLogin() {
    setError("");

    if (!supabaseReady) {
      setError("Google sign-in requires a hosted connection. Use guest sign-in instead.");
      return;
    }

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

  return (
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-line bg-panel-soft p-4 text-sm leading-6 text-muted">
        Continue with Google or start a quick guest session.
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="space-y-3">
        <Button
          fullWidth
          onClick={handleGoogleLogin}
          type="button"
        >
          <Chrome className="size-4" />
          Continue with Google
        </Button>
        <button
          className={getButtonClassName({ variant: "secondary", fullWidth: true })}
          disabled={isSubmitting}
          onClick={handleGuestSession}
          type="button"
        >
          {isSubmitting ? <Spinner /> : null}
          {isSubmitting ? "Starting session…" : "Quick guest session"}
        </button>
      </div>
    </div>
  );
}
