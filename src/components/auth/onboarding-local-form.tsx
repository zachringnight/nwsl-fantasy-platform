"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { getButtonClassName, Button } from "@/components/ui/button";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { NWSL_CLUBS_LIST } from "@/config/nwsl-clubs";
import { completeLocalOnboarding } from "@/lib/local-mode-store";
import type { FantasyProfile } from "@/types/fantasy";

export function OnboardingLocalForm() {
  const { refreshProfile } = useFantasyAuth();

  return (
    <FantasyAuthGate
      loadingDescription="Loading."
      loadingTitle="Checking your account"
      requireOnboarding={false}
      signedOutAction={
        <Link className={getButtonClassName()} href="/signup">
          Create account
        </Link>
      }
      signedOutDescription="Sign in or create an account before saving preferences."
      signedOutTitle="Sign in to continue"
    >
      {({ profile }) => (
        <OnboardingLocalFields profile={profile} refreshProfile={refreshProfile} />
      )}
    </FantasyAuthGate>
  );
}

interface OnboardingLocalFieldsProps {
  profile: FantasyProfile;
  refreshProfile: () => Promise<void>;
}

function OnboardingLocalFields({ profile, refreshProfile }: OnboardingLocalFieldsProps) {
  const dataClient = useFantasyDataClient();
  const { supabaseReady } = useFantasyAuth();
  const router = useRouter();
  const [favoriteClub, setFavoriteClub] = useState(profile.favorite_club ?? "");
  const [experienceLevel, setExperienceLevel] = useState<"new" | "casual" | "experienced">(
    profile.experience_level ?? "new"
  );
  const isReturning = profile.onboarding_complete;
  const [nextStep, setNextStep] = useState<"create" | "join" | "dashboard">(
    isReturning ? "dashboard" : "create"
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (!supabaseReady) {
        completeLocalOnboarding({ favoriteClub, experienceLevel });
        await refreshProfile();
      } else {
        await dataClient.upsertFantasyProfile({
          displayName: profile.display_name,
          favoriteClub,
          experienceLevel,
          onboardingComplete: true,
        });
        await refreshProfile();
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to save onboarding."
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    const destinations = {
      create: "/leagues/create",
      join: "/leagues/join",
      dashboard: "/dashboard",
    } as const;
    router.push(destinations[nextStep]);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Favorite club</span>
        <select
          className="field-control"
          value={favoriteClub}
          onChange={(event) => setFavoriteClub(event.target.value)}
          required
        >
          <option value="">Select a club</option>
          {NWSL_CLUBS_LIST.map((club) => (
            <option key={club.abbreviation} value={club.name}>
              {club.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Fantasy comfort level</span>
        <select
          className="field-control"
          value={experienceLevel}
          onChange={(event) =>
            setExperienceLevel(event.target.value as "new" | "casual" | "experienced")
          }
        >
          <option value="new">New to fantasy</option>
          <option value="casual">Casual player</option>
          <option value="experienced">Experienced player</option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">What do you want to do next?</span>
        <select
          className="field-control"
          value={nextStep}
          onChange={(event) => setNextStep(event.target.value as "create" | "join" | "dashboard")}
        >
          {isReturning && <option value="dashboard">Back to dashboard</option>}
          <option value="create">Create a league</option>
          <option value="join">Join a league</option>
        </select>
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button disabled={isSubmitting} fullWidth type="submit">
        {isSubmitting ? "Saving onboarding..." : "Save and continue"}
      </Button>
    </form>
  );
}
