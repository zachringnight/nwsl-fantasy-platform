"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { Copy, Settings, Shield, UserMinus, Users } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Pill } from "@/components/ui/pill";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import {
  formatFantasySlateRange,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import type { FantasyLeagueDetails } from "@/types/fantasy";

export interface LeagueSettingsClientProps {
  leagueId: string;
}

export function LeagueSettingsClient({ leagueId }: LeagueSettingsClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session, user } = useFantasyAuth();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [leagueDetails, setLeagueDetails] = useState<FantasyLeagueDetails | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    leagueName: "",
    draftAt: "",
    managerCountTarget: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const refreshLeague = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeagueDetails(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const details = await dataClient.loadLeagueById(leagueId);
      setLeagueDetails(details);
      if (details) {
        setSettingsForm({
          leagueName: details.league.name,
          draftAt: new Date(details.league.draft_at).toISOString().slice(0, 16),
          managerCountTarget: String(details.league.manager_count_target),
        });
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load league settings."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshLeague();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable in non-HTTPS contexts
    }
  }

  async function handleSettingsSave(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setSaveMessage("");

    try {
      await dataClient.updateLeagueSettings(leagueId, {
        name: settingsForm.leagueName,
        draftAt: settingsForm.draftAt,
        managerCountTarget: Number(settingsForm.managerCountTarget),
      });
      setSaveMessage("Settings saved successfully.");
      void refreshLeague();
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Unable to save settings. Try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FantasyAuthGate
      loadingDescription="Loading."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Complete your profile to continue."
      signedOutDescription="Sign in to continue."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoading && !leagueDetails) {
          return (
            <EmptyState
              description="Loading the league configuration."
              title="Loading settings"
            />
          );
        }

        if (error && !leagueDetails) {
          return <EmptyState description={error} title="Unable to load settings" />;
        }

        if (!leagueDetails) {
          return (
            <EmptyState
              description="That league could not be found."
              title="League not found"
            />
          );
        }

        const modeConfig = getFantasyModeConfig(leagueDetails.league);
        const isCommissioner = leagueDetails.league.commissioner_user_id === user?.id;
        const activeSlate = modeConfig.usesSalaryCap
          ? getFantasyTargetSlate(leagueDetails.league)
          : null;
        const commissionerName =
          leagueDetails.memberships.find(
            (member) => member.user_id === leagueDetails.league.commissioner_user_id
          )?.display_name ?? "Unknown";

        return (
          <section className="space-y-5">
            <MotionReveal>
              <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <SurfaceCard
                  description="Format, roster rules, and key details for this league."
                  eyebrow="League integrity"
                  title={modeConfig.label}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Pill tone="brand">
                        {leagueDetails.league.roster_build_mode === "snake_draft"
                          ? "Snake draft"
                          : "Salary cap"}
                      </Pill>
                      <Pill tone="default">
                        {leagueDetails.league.player_ownership_mode === "exclusive"
                          ? "Exclusive rosters"
                          : "Shared player pool"}
                      </Pill>
                      <Pill tone="success">{modeConfig.cadenceLabel} cadence</Pill>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="relative">
                        <MetricTile
                          detail="Share this code with the next manager you want in the room."
                          label="League code"
                          value={leagueDetails.league.code}
                        />
                        <button
                          className="absolute right-3 top-3 rounded-full border border-line bg-white/6 p-2 text-muted transition hover:border-brand-strong/35 hover:text-brand-strong"
                          onClick={() => handleCopyCode(leagueDetails.league.code)}
                          type="button"
                          aria-label="Copy league code"
                        >
                          <Copy className="size-3.5" />
                        </button>
                        {codeCopied && (
                          <span className="absolute right-3 top-14 text-xs text-brand-lime">
                            Copied
                          </span>
                        )}
                      </div>
                      <MetricTile
                        detail={
                          activeSlate
                            ? formatFantasySlateRange(activeSlate)
                            : "Commissioner-set draft kickoff remains the primary schedule anchor."
                        }
                        label={activeSlate ? "Active slate" : "Draft timing"}
                        tone="brand"
                        value={
                          activeSlate
                            ? activeSlate.label
                            : new Date(leagueDetails.league.draft_at).toLocaleDateString()
                        }
                      />
                    </div>

                    <div className="rounded-[1.35rem] border border-line bg-panel-soft p-4 text-sm leading-6 text-muted">
                      <p className="font-semibold text-foreground">Timing rule</p>
                      <p className="mt-2">
                        {activeSlate
                          ? `${activeSlate.label} locks ${new Date(activeSlate.lock_at).toLocaleString()} and runs ${formatFantasySlateRange(activeSlate)}.`
                          : `${modeConfig.scheduleLabel}: ${new Date(leagueDetails.league.draft_at).toLocaleString()}.`}
                      </p>
                      {leagueDetails.league.salary_cap_amount ? (
                        <p className="mt-2">Salary cap: ${leagueDetails.league.salary_cap_amount}</p>
                      ) : null}
                    </div>
                  </div>
                </SurfaceCard>

                <SurfaceCard
                  description={
                    isCommissioner
                      ? "You can manage invites and communications while the core competition rules stay fixed."
                      : "Core competition settings stay fixed once managers have joined."
                  }
                  eyebrow={isCommissioner ? "Commissioner scope" : "Manager visibility"}
                  title={isCommissioner ? "What you can still operate" : "What stays fixed now"}
                  tone="accent"
                >
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MetricTile
                        detail="League capacity is pinned for invitation planning."
                        label="Managers"
                        tone="accent"
                        value={`${leagueDetails.memberships.length}/${leagueDetails.league.manager_count_target}`}
                      />
                      <MetricTile
                        detail="The owner of this league remains visible throughout the league."
                        label="Commissioner"
                        tone="accent"
                        value={commissionerName}
                      />
                    </div>

                    <div className="rounded-[1.35rem] border border-line bg-night/35 p-4 text-sm leading-6 text-muted">
                      <p className="inline-flex items-center gap-2 font-semibold text-foreground">
                        <Users className="size-4" />
                        Member list
                      </p>
                      <div className="mt-3 space-y-2">
                        {leagueDetails.memberships.map((member) => (
                          <div
                            key={member.user_id}
                            className="flex items-center justify-between rounded-[1rem] border border-line bg-white/4 px-4 py-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {member.display_name}
                              </span>
                              {member.user_id === leagueDetails.league.commissioner_user_id && (
                                <Pill tone="brand">
                                  <Shield className="size-3" />
                                  Commissioner
                                </Pill>
                              )}
                            </div>
                            {isCommissioner &&
                              member.user_id !== leagueDetails.league.commissioner_user_id && (
                                <button
                                  className="rounded-full border border-line bg-white/6 p-1.5 text-muted transition hover:border-danger/35 hover:text-danger"
                                  title="Remove manager"
                                  type="button"
                                >
                                  <UserMinus className="size-3.5" />
                                </button>
                              )}
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 font-semibold text-foreground">Current status</p>
                      <p className="mt-2 capitalize">{leagueDetails.league.status}</p>
                    </div>
                  </div>
                </SurfaceCard>
              </section>
            </MotionReveal>

            {isCommissioner && (
              <MotionReveal>
                <SurfaceCard
                  eyebrow="Commissioner controls"
                  title="Edit league settings"
                  description="Update league name, draft timing, and capacity."
                >
                  <form className="space-y-4" onSubmit={handleSettingsSave}>
                    <label className="block space-y-2">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                        <Settings className="size-3.5" />
                        League name
                      </span>
                      <input
                        className="field-control"
                        value={settingsForm.leagueName}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, leagueName: e.target.value })
                        }
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">
                          {modeConfig.scheduleLabel}
                        </span>
                        <input
                          className="field-control"
                          type="datetime-local"
                          value={settingsForm.draftAt}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, draftAt: e.target.value })
                          }
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">
                          Manager capacity
                        </span>
                        <input
                          className="field-control"
                          type="number"
                          min="2"
                          max="16"
                          value={settingsForm.managerCountTarget}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              managerCountTarget: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? "Saving…" : "Save settings"}
                      </Button>
                      {saveMessage && (
                        <span className="text-sm text-brand-lime">{saveMessage}</span>
                      )}
                    </div>
                  </form>
                </SurfaceCard>
              </MotionReveal>
            )}
          </section>
        );
      }}
    </FantasyAuthGate>
  );
}
