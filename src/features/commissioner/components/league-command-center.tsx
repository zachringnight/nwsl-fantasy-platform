"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Settings2, Shield, Users } from "lucide-react";
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
            detail="Capacity stays visible so invite urgency is obvious."
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
          <div className="rounded-[1.4rem] border border-line bg-night/35 p-4 text-sm leading-6 text-muted">
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <Shield className="size-4 text-brand-strong" />
              Invite route
            </p>
            <p className="mt-3 break-all">{invitePath}</p>
          </div>
          <div className="rounded-[1.4rem] border border-line bg-night/35 p-4 text-sm leading-6 text-muted">
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <Users className="size-4 text-brand-strong" />
              Manager order
            </p>
            <p className="mt-3">
              {leagueDetails.memberships.map((member) => member.display_name).join(", ")}
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
