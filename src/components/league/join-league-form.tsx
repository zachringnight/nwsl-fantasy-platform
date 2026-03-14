"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { normalizeFantasyLeagueCode } from "@/lib/fantasy-league-inputs";

export interface JoinLeagueFormProps {
  initialCode?: string;
}

export function JoinLeagueForm({ initialCode }: JoinLeagueFormProps) {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const league = await dataClient.joinHostedLeagueByCode(normalizeFantasyLeagueCode(code));
      router.push(`/leagues/${league.id}`);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to join that league."
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before joining a league."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and fantasy experience level before joining a league."
      signedOutAction={
        <Link className={getButtonClassName()} href="/signup">
          Create account
        </Link>
      }
      signedOutDescription="Sign in before joining a league."
      signedOutTitle="Sign in to continue"
    >
      {() => (
        <form className="space-y-4" noValidate onSubmit={handleSubmit}>
          <input
            className="field-control"
            type="text"
            placeholder="Enter league code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoCapitalize="characters"
            maxLength={6}
            required
            aria-invalid={Boolean(error)}
          />
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Joining league..." : "Join league"}
          </Button>
        </form>
      )}
    </FantasyAuthGate>
  );
}
