"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";

export function LoginLocalForm() {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, refreshProfile, supabaseReady } = useFantasyAuth();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!supabaseReady) {
    return (
      <EmptyState
        title="Sign-in unavailable"
        description="This environment is missing the account configuration required for sign-in."
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await dataClient.ensureHostedSession();
      await refreshProfile();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to start your session."
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    router.push("/signup");
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="rounded-[1.4rem] border border-line bg-panel-soft p-4 text-sm leading-6 text-muted">
        Start with a lightweight account session now. Your display name, club, leagues, and entries stay available when you return.
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button disabled={isSubmitting} fullWidth type="submit">
        {isSubmitting ? "Starting session..." : "Continue"}
      </Button>
    </form>
  );
}
