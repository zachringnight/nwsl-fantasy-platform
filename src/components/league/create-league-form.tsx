"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CalendarRange,
  ShieldCheck,
  TimerReset,
  Trophy,
  Users2,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { getFantasyModeConfig, getFantasyModeOptions } from "@/lib/fantasy-modes";
import {
  formatFantasySlateRange,
  getFantasySlateWindows,
} from "@/lib/fantasy-slate-engine";
import { cn } from "@/lib/utils";
import type { FantasyGameVariant } from "@/types/fantasy";

const defaultGameVariant: FantasyGameVariant = "classic_season_long";
const modeOptions = getFantasyModeOptions();

export function CreateLeagueForm() {
  const router = useRouter();
  const dataClient = useFantasyDataClient();
  const [leagueName, setLeagueName] = useState("");
  const [draftAt, setDraftAt] = useState("");
  const [gameVariant, setGameVariant] = useState<FantasyGameVariant>(defaultGameVariant);
  const [managerCountTarget, setManagerCountTarget] = useState("10");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedMode = getFantasyModeConfig(gameVariant);
  const salaryCapSlates = selectedMode.usesSalaryCap ? getFantasySlateWindows(gameVariant) : [];
  const firstSlate = salaryCapSlates[0] ?? null;
  const lastSlate = salaryCapSlates[salaryCapSlates.length - 1] ?? null;
  const formStatus = selectedMode.usesLiveDraftRoom
    ? "Set the draft night and invite the room."
    : "Contest lock windows are pulled directly from the 2026 schedule.";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const league = await dataClient.createHostedLeague({
        name: leagueName,
        draftAt,
        gameVariant,
        managerCountTarget: Number(managerCountTarget),
      });
      router.push(`/leagues/${league.id}`);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create the league."
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before league creation."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and fantasy experience level before creating a league."
      signedOutAction={
        <Link className={getButtonClassName()} href="/signup">
          Create account
        </Link>
      }
      signedOutDescription="Sign in before creating a league."
      signedOutTitle="Sign in to create a league"
    >
      {() => (
        <form className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]" onSubmit={handleSubmit}>
          <SurfaceCard
            eyebrow="League format"
            title="Choose the fantasy mode"
            description="Pick the format that matches how your group wants to play."
            className="overflow-hidden"
          >
            <div className="grid gap-3">
              {modeOptions.map((option) => (
                <label
                  key={option.variant}
                  className={cn(
                    "group kinetic-hover relative block cursor-pointer overflow-hidden rounded-[1.65rem] border px-5 py-5 transition duration-300",
                    option.variant === gameVariant
                      ? "border-brand bg-brand text-white shadow-[0_24px_80px_rgba(5,34,255,0.3)]"
                      : "border-line bg-panel text-foreground hover:border-brand/35 hover:bg-panel-strong"
                  )}
                >
                  <input
                    checked={option.variant === gameVariant}
                    className="sr-only"
                    name="gameVariant"
                    onChange={() => {
                      setGameVariant(option.variant);
                    }}
                    type="radio"
                    value={option.variant}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em]",
                            option.variant === gameVariant
                              ? "border-white/15 bg-white/10 text-white/80"
                              : "border-line bg-white/6 text-brand-strong"
                          )}
                        >
                          {option.label}
                        </span>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em]",
                            option.variant === gameVariant
                              ? "bg-white/10 text-white/80"
                              : "bg-accent-soft/50 text-accent"
                          )}
                        >
                          {option.usesSalaryCap
                            ? `$${option.defaultSalaryCapAmount} cap`
                            : "Snake draft"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-semibold tracking-[-0.02em]">
                          {option.usesSalaryCap
                            ? `${option.cadenceLabel} shared-pool contest`
                            : "Season-long head-to-head league"}
                        </p>
                        <p
                          className={cn(
                            "max-w-2xl text-sm leading-6",
                            option.variant === gameVariant ? "text-white/84" : "text-muted"
                          )}
                        >
                          {option.description}
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      className={cn(
                        "mt-1 size-5 transition duration-300",
                        option.variant === gameVariant
                          ? "translate-x-0 text-white/78"
                          : "text-muted group-hover:translate-x-0.5 group-hover:text-brand-strong"
                      )}
                    />
                  </div>
                  <div
                    className={cn(
                      "mt-4 grid gap-3 text-xs uppercase tracking-[0.18em] sm:grid-cols-3",
                      option.variant === gameVariant ? "text-white/72" : "text-muted"
                    )}
                  >
                    <div className="inline-flex items-center gap-2">
                      <Users2 className="size-3.5" />
                      {option.usesExclusivePlayerOwnership ? "Exclusive pool" : "Shared pool"}
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <TimerReset className="size-3.5" />
                      {option.cadenceLabel} timing
                    </div>
                    <div className="inline-flex items-center gap-2">
                      {option.usesSalaryCap ? (
                        <Wallet className="size-3.5" />
                      ) : (
                        <Trophy className="size-3.5" />
                      )}
                      {option.usesSalaryCap ? "Contest entry" : "Draft room"}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </SurfaceCard>

          <div className="grid gap-6">
            <SurfaceCard
              eyebrow="Commissioner setup"
              title="Name the league"
              description={formStatus}
              tone="accent"
            >
              <div className="grid gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">League name</span>
                  <input
                    className="field-control"
                    type="text"
                    placeholder="Founders Cup"
                    value={leagueName}
                    onChange={(event) => setLeagueName(event.target.value)}
                    required
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Target managers</span>
                  <select
                    className="field-control"
                    value={managerCountTarget}
                    onChange={(event) => setManagerCountTarget(event.target.value)}
                  >
                    <option value="8">8 managers</option>
                    <option value="10">10 managers</option>
                    <option value="12">12 managers</option>
                  </select>
                </label>

                {selectedMode.usesLiveDraftRoom ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      {selectedMode.scheduleLabel}
                    </span>
                    <input
                      className="field-control"
                      type="datetime-local"
                      value={draftAt}
                      onChange={(event) => setDraftAt(event.target.value)}
                      required
                    />
                    <span className="block text-xs leading-5 text-muted">
                      Classic leagues still use a commissioner-set live draft kickoff.
                    </span>
                  </label>
                ) : (
                  <div className="rounded-[1.4rem] border border-line bg-night/55 p-4">
                    <div className="flex items-start gap-3">
                      <CalendarRange className="mt-1 size-5 text-brand-strong" />
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">Official slate timing</p>
                        <p className="text-sm leading-6 text-muted">
                          {firstSlate
                            ? `First lock is ${new Date(firstSlate.lock_at).toLocaleString()}. The contest calendar runs ${formatFantasySlateRange(firstSlate)} through ${lastSlate ? formatFantasySlateRange(lastSlate) : ""}.`
                            : "Official slate timing is unavailable."}
                        </p>
                        <div className="grid gap-2 text-xs uppercase tracking-[0.18em] text-muted sm:grid-cols-2">
                          <p>Season opens: {firstSlate?.label ?? "Unavailable"}</p>
                          <p>Total slates: {salaryCapSlates.length}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Format readout"
              title={selectedMode.label}
              description="A quick read on roster rules, lock rhythm, and how this room handles player control."
            >
              <div className="grid gap-3 text-sm text-foreground sm:grid-cols-2">
                <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Ownership
                  </p>
                  <p className="mt-2 font-semibold">
                    {selectedMode.usesExclusivePlayerOwnership
                      ? "Exclusive roster ownership"
                      : "Shared-player contest pool"}
                  </p>
                </div>
                <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Cadence
                  </p>
                  <p className="mt-2 font-semibold">{selectedMode.cadenceLabel} contest cycle</p>
                </div>
                <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Entry model
                  </p>
                  <p className="mt-2 font-semibold">
                    {selectedMode.usesSalaryCap
                      ? "Single-entry submit and lock workflow"
                      : "Live commissioner draft room"}
                  </p>
                </div>
                <div className="edge-field rounded-[1.25rem] border border-line bg-white/6 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Integrity
                  </p>
                  <p className="mt-2 font-semibold">
                    {selectedMode.usesSalaryCap
                      ? "Official NWSL slate timing"
                      : "Commissioner-set draft start"}
                  </p>
                </div>
              </div>

              {selectedMode.usesSalaryCap ? (
                <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-brand/20 bg-brand/10 p-4 text-sm leading-6 text-foreground">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-strong" />
                  <p>
                    Salary-cap preset: <strong>${selectedMode.defaultSalaryCapAmount}</strong>. This
                    room uses a shared player pool and contest windows tied directly to the 2026 NWSL calendar.
                  </p>
                </div>
              ) : null}

              {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

              <Button
                className="mt-5"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting
                  ? "Creating league..."
                  : selectedMode.usesSalaryCap
                    ? "Create salary-cap league"
                    : "Create classic league"}
                <ArrowRight className="size-4" />
              </Button>
            </SurfaceCard>
          </div>
        </form>
      )}
    </FantasyAuthGate>
  );
}
