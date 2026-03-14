"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarClock,
  Copy,
  Crown,
  HeartHandshake,
  RadioTower,
  Settings2,
  Sparkles,
  TimerReset,
  Users2,
} from "lucide-react";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Pill } from "@/components/ui/pill";
import { getButtonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FantasyModeConfig } from "@/lib/fantasy-modes";
import type {
  FantasyLeagueDetails,
  FantasySlateWindow,
} from "@/types/fantasy";

export interface LeagueHomeFeedProps {
  activeSlate: FantasySlateWindow | null;
  cadenceLabel: string;
  exploreHref: string;
  exploreLabel: string;
  invitePath: string;
  isCommissioner: boolean;
  leagueDetails: FantasyLeagueDetails;
  modeConfig: FantasyModeConfig;
  ownershipLabel: string;
  primaryActionHref: string;
  primaryActionLabel: string;
  scheduleSummary: string;
  secondaryActionHref: string;
  secondaryActionLabel: string;
  settingsHref: string;
}

const statusMeta = {
  complete: {
    kicker: "Season complete",
    summary: "Final standings are in. Review results and see how every roster finished.",
  },
  live: {
    kicker: "Live league",
    summary: "Matches are underway. Check scores and make your next move.",
  },
  ready: {
    kicker: "Ready to play",
    summary: "Your league is set. Lock in lineups and get ready for matchups.",
  },
  setup: {
    kicker: "Setting up",
    summary: "Invite friends, fill the league, and get ready to draft.",
  },
} as const;

export function LeagueHomeFeed({
  activeSlate,
  cadenceLabel,
  exploreHref,
  exploreLabel,
  invitePath,
  isCommissioner,
  leagueDetails,
  modeConfig,
  ownershipLabel,
  primaryActionHref,
  primaryActionLabel,
  scheduleSummary,
  secondaryActionHref,
  secondaryActionLabel,
  settingsHref,
}: LeagueHomeFeedProps) {
  const [copyLabel, setCopyLabel] = useState("Copy invite");
  const managerFillPercentage = Math.min(
    Math.round(
      (leagueDetails.memberships.length / leagueDetails.league.manager_count_target) * 100
    ),
    100
  );
  const statusStory = statusMeta[leagueDetails.league.status];
  const rosterBuilderLabel =
    leagueDetails.league.roster_build_mode === "snake_draft" ? "Classic draft" : "Salary cap";
  const scheduleChip = activeSlate
    ? `${activeSlate.match_count} matches`
    : new Date(leagueDetails.league.draft_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
  const quickMoves = [
    {
      eyebrow: "Now",
      href: primaryActionHref,
      label: primaryActionLabel,
    },
    {
      eyebrow: "Next",
      href: secondaryActionHref,
      label: secondaryActionLabel,
    },
    {
      eyebrow: isCommissioner ? "Tune" : "Explore",
      href: isCommissioner ? settingsHref : exploreHref,
      label: isCommissioner ? "Open settings" : exploreLabel,
    },
  ];
  const clubSignals = [
    {
      label: "Managers",
      value: `${leagueDetails.memberships.length}/${leagueDetails.league.manager_count_target}`,
    },
    {
      label: activeSlate ? "Matches" : "Draft",
      value: scheduleChip,
    },
    {
      label: "Format",
      value: rosterBuilderLabel,
    },
  ];

  const handleCopyInvite = async () => {
    const inviteUrl =
      typeof window === "undefined" ? invitePath : `${window.location.origin}${invitePath}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyLabel("Copied invite");
      window.setTimeout(() => {
        setCopyLabel("Copy invite");
      }, 1800);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => {
        setCopyLabel("Copy invite");
      }, 1800);
    }
  };

  return (
    <section className="club-feed-grid">
      <MotionReveal className="lg:col-span-7" emphasis="live">
        <article className="club-feed-card club-feed-card-spotlight">
          <div className="club-feed-orb club-feed-orb-rose" />
          <div className="club-feed-orb club-feed-orb-gold" />

          <div className="relative z-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Pill tone="accent" className="border-white/12 bg-white/10 text-white">
                  {statusStory.kicker}
                </Pill>
                <Pill tone="brand" className="border-white/14 bg-white/10 text-white">
                  {modeConfig.label}
                </Pill>
              </div>

              <div className="space-y-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-white/75">
                  Your league
                </p>
                <h2 className="font-display text-[3.6rem] uppercase leading-[0.88] tracking-[0.01em] text-white sm:text-[4.3rem]">
                  {leagueDetails.league.name}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-white/76 sm:text-base">
                  {statusStory.summary}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="club-sticker">Code {leagueDetails.league.code}</span>
                <span className="club-sticker">{leagueDetails.memberships.length} managers</span>
                {leagueDetails.currentMembership?.team_name ? (
                  <span className="club-sticker">{leagueDetails.currentMembership.team_name}</span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href={primaryActionHref} className={getButtonClassName()}>
                  {primaryActionLabel}
                </Link>
                <Link
                  href={secondaryActionHref}
                  className={getButtonClassName({
                    variant: "secondary",
                  })}
                >
                  {secondaryActionLabel}
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="club-score-panel">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-white/75">
                  League capacity
                </p>
                <div className="mt-4 flex items-end gap-3">
                  <span className="font-display text-[4.4rem] leading-none text-white">
                    {managerFillPercentage}
                  </span>
                  <span className="pb-2 text-sm font-semibold uppercase tracking-[0.2em] text-white/75">
                    %
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#ff7eb6_0%,#00e1ff_54%,#c5ff5f_100%)]"
                    style={{ width: `${managerFillPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {clubSignals.map((signal) => (
                  <div key={signal.label} className="club-mini-stat">
                    <p>{signal.label}</p>
                    <strong>{signal.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      </MotionReveal>

      <MotionReveal className="lg:col-span-5" delay={70} variant="right">
        <article className="club-feed-card club-feed-card-poster">
          <div className="relative z-10 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone="brand" className="border-white/12 bg-white/10 text-white">
                Upcoming
              </Pill>
              <span className="club-poster-badge">{cadenceLabel}</span>
            </div>

            <div className="space-y-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-white/75">
                Schedule
              </p>
              <h3 className="font-display text-[3rem] uppercase leading-[0.9] text-white sm:text-[3.5rem]">
                {activeSlate ? activeSlate.label : "Draft night locked"}
              </h3>
              <p className="text-sm leading-7 text-white/74">{scheduleSummary}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="club-poster-tile">
                <CalendarClock className="size-5" />
                <div>
                  <p>Window</p>
                  <strong>{activeSlate ? "Matches live" : "Draft"}</strong>
                </div>
              </div>
              <div className="club-poster-tile">
                <TimerReset className="size-5" />
                <div>
                  <p>Status</p>
                  <strong>{leagueDetails.league.status}</strong>
                </div>
              </div>
            </div>
          </div>
        </article>
      </MotionReveal>

      <MotionReveal className="lg:col-span-4" delay={110}>
        <article className="club-feed-card club-feed-card-night">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone="accent" className="border-white/10 bg-white/8 text-white">
                Managers
              </Pill>
              <Users2 className="size-5 text-white/78" />
            </div>

            <div className="flex flex-wrap gap-3">
              {leagueDetails.memberships.slice(0, 6).map((member, index) => (
                <div key={member.id} className="club-avatar-tile">
                  <span className={cn("club-avatar-core", index % 2 === 0 ? "club-avatar-rose" : "club-avatar-cyan")}>
                    {getInitials(member.display_name)}
                  </span>
                  <div>
                    <p>{member.display_name}</p>
                    <strong>{member.team_name || "Team pending"}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/75">
                <span>Spots filled</span>
                <span>{managerFillPercentage}% full</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#00e1ff_0%,#ff7eb6_52%,#ffc894_100%)]"
                  style={{ width: `${managerFillPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </article>
      </MotionReveal>

      <MotionReveal className="lg:col-span-4" delay={150}>
        <article className="club-feed-card club-feed-card-night">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone="brand" className="border-white/12 bg-white/10 text-white">
                Invite friends
              </Pill>
              <HeartHandshake className="size-5 text-white/70" />
            </div>

            <div className="space-y-3">
              <p className="text-sm leading-7 text-white/74">
                Share the link or code to invite players.
              </p>
              <div className="rounded-[1.3rem] border border-white/12 bg-white/6 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/75">
                  Invite link
                </p>
                <p className="mt-3 break-all text-sm text-white/86">{invitePath}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="club-sticker">Code {leagueDetails.league.code}</span>
                <span className="club-sticker">
                  {copyLabel === "Copied invite" ? "Shared" : "Ready to share"}
                </span>
              </div>
            </div>

            <button
              className={getButtonClassName({
                className: "w-full justify-center",
                variant: "secondary",
              })}
              onClick={() => {
                void handleCopyInvite();
              }}
              type="button"
            >
              <Copy className="size-4" />
              {copyLabel}
            </button>
          </div>
        </article>
      </MotionReveal>

      <MotionReveal className="lg:col-span-4" delay={190}>
        <article className="club-feed-card club-feed-card-night">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone="accent" className="border-white/10 bg-white/8 text-white">
                Quick moves
              </Pill>
              <RadioTower className="size-5 text-white/70" />
            </div>

            <div className="space-y-3">
              {quickMoves.map((move) => (
                <Link key={move.label} href={move.href} className="club-action-row">
                  <div>
                    <p>{move.eyebrow}</p>
                    <strong>{move.label}</strong>
                  </div>
                  <span>Open</span>
                </Link>
              ))}
            </div>
          </div>
        </article>
      </MotionReveal>

      <MotionReveal className="lg:col-span-6" delay={240}>
        <article className="club-feed-card club-feed-card-ribbon">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone="brand" className="border-white/12 bg-white/10 text-white">
                League info
              </Pill>
              <Sparkles className="size-5 text-white/70" />
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="club-sticker">{ownershipLabel}</span>
              <span className="club-sticker">{rosterBuilderLabel}</span>
              <span className="club-sticker">{leagueDetails.league.privacy} league</span>
              {leagueDetails.league.salary_cap_amount ? (
                <span className="club-sticker">${leagueDetails.league.salary_cap_amount} cap</span>
              ) : null}
            </div>

            <p className="max-w-2xl text-sm leading-7 text-white/74">
              Your league format, roster rules, and key settings at a glance.
            </p>
          </div>
        </article>
      </MotionReveal>

      <MotionReveal className="lg:col-span-6" delay={280}>
        <article className="club-feed-card club-feed-card-night">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone="accent" className="border-white/10 bg-white/8 text-white">
                {isCommissioner ? "Commissioner controls" : "League controls"}
              </Pill>
              <Crown className="size-5 text-white/70" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link href={exploreHref} className="club-control-tile">
                <p>Explore</p>
                <strong>{exploreLabel}</strong>
              </Link>
              <Link href={settingsHref} className="club-control-tile">
                <p>{isCommissioner ? "Commissioner" : "League"}</p>
                <strong>
                  <Settings2 className="size-4" />
                  Open settings
                </strong>
              </Link>
            </div>
          </div>
        </article>
      </MotionReveal>
    </section>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
