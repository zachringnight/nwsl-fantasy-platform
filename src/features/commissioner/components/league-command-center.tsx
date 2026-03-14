"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Settings2, Shield, Sparkles, Users } from "lucide-react";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import type { FantasyLeagueDetails } from "@/types/fantasy";

export interface LeagueCommandCenterProps {
  cadenceLabel: string;
  exploreHref: string;
  exploreLabel: string;
  invitePath: string;
  isCommissioner: boolean;
  leagueDetails: FantasyLeagueDetails;
  ownershipLabel: string;
  rosterBuilderLabel: string;
  scheduleSummary: string;
  secondarySummary?: string;
  settingsHref: string;
}

export function LeagueCommandCenter({
  cadenceLabel,
  exploreHref,
  exploreLabel,
  invitePath,
  isCommissioner,
  leagueDetails,
  ownershipLabel,
  rosterBuilderLabel,
  scheduleSummary,
  secondarySummary,
  settingsHref,
}: LeagueCommandCenterProps) {
  const [copyLabel, setCopyLabel] = useState("Copy invite");
  const managerFillPercentage = Math.round(
    (leagueDetails.memberships.length / leagueDetails.league.manager_count_target) * 100
  );

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
    <SurfaceCard
      description={scheduleSummary}
      eyebrow={isCommissioner ? "Commissioner view" : "League info"}
      title={isCommissioner ? "Run league operations" : "League settings at a glance"}
      tone="accent"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            detail="Keep an eye on how quickly the room is filling."
            label="Managers"
            tone="accent"
            value={`${leagueDetails.memberships.length}/${leagueDetails.league.manager_count_target}`}
          />
          <MetricTile
            detail={secondarySummary ?? "Cadence and roster rules stay pinned here for fast scanning."}
            label="Cadence"
            tone="accent"
            value={cadenceLabel}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill tone="brand">{ownershipLabel}</Pill>
          <Pill tone="default">{rosterBuilderLabel}</Pill>
          {leagueDetails.currentMembership?.team_name ? (
            <Pill tone="success">{leagueDetails.currentMembership.team_name}</Pill>
          ) : null}
          {leagueDetails.league.salary_cap_amount ? (
            <Pill tone="success">${leagueDetails.league.salary_cap_amount} cap</Pill>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="league-mood-card rounded-[1.45rem] border border-white/12 p-4 text-sm leading-6 text-white/74">
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <Shield className="size-4 text-brand-strong" />
              Invite route
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="brand">Code {leagueDetails.league.code}</Pill>
              <Pill tone="accent">{copyLabel === "Copied invite" ? "Shared" : "Ready to share"}</Pill>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/78">
              Drop the link in the group chat when the crew is ready.
            </p>
            <p className="mt-3 break-all text-xs text-white/75">{invitePath}</p>
          </div>
          <div className="rounded-[1.45rem] border border-line bg-night/35 p-4 text-sm leading-6 text-white/74">
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <Users className="size-4 text-brand-strong" />
              Manager circle
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {leagueDetails.memberships.map((member) => (
                <span
                  key={member.id}
                  className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5 text-xs font-semibold tracking-[0.02em] text-white/84"
                >
                  {member.display_name}
                </span>
              ))}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#ff7eb6_0%,#00e1ff_100%)]"
                style={{ width: `${managerFillPercentage}%` }}
              />
            </div>
            <p className="mt-2 inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#ffd5e5]">
              <Sparkles className="size-3.5" />
              {managerFillPercentage}% full
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className={getButtonClassName({
              className: "justify-center",
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
          <Link
            className={getButtonClassName({
              className: "justify-center",
            })}
            href={exploreHref}
          >
            {exploreLabel}
          </Link>
        </div>

        <Link
          className={getButtonClassName({
            className: "w-full justify-center",
            variant: "ghost",
          })}
          href={settingsHref}
        >
          <Settings2 className="size-4" />
          Open league settings
        </Link>
      </div>
    </SurfaceCard>
  );
}
