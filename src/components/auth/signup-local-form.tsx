"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";

export function SignupLocalForm() {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const { hasHydrated, profile, refreshProfile, supabaseReady } = useFantasyAuth();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create your account."
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    router.push("/onboarding");
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Display name</span>
        <input
          className="field-control"
          type="text"
          placeholder="Rose City Press"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button disabled={isSubmitting} fullWidth type="submit">
        {isSubmitting ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
