import { Clock3, Crown, Sparkles } from "lucide-react";
import Link from "next/link";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import type { FantasyLeagueDetails } from "@/types/fantasy";

export interface ClassicLeagueBriefProps {
  description: string;
  leagueDetails: FantasyLeagueDetails;
  primaryActionHref: string;
  primaryActionLabel: string;
  secondaryActionHref: string;
  secondaryActionLabel: string;
}

export function ClassicLeagueBrief({
  description,
  leagueDetails,
  primaryActionHref,
  primaryActionLabel,
  secondaryActionHref,
  secondaryActionLabel,
}: ClassicLeagueBriefProps) {
  return (
    <SurfaceCard
      description={`Code ${leagueDetails.league.code} • ${leagueDetails.memberships.length}/${leagueDetails.league.manager_count_target} managers in`}
      eyebrow="Classic overview"
      title={leagueDetails.league.name}
      tone="brand"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Pill tone="brand">Code {leagueDetails.league.code}</Pill>
          <Pill tone="default">
            {leagueDetails.memberships.length}/{leagueDetails.league.manager_count_target} managers
          </Pill>
          {leagueDetails.currentMembership?.team_name ? (
            <Pill tone="success">{leagueDetails.currentMembership.team_name}</Pill>
          ) : null}
        </div>

        <p className="max-w-2xl text-sm leading-6 text-white/78">
          {description} Keep the room sharp, the draft central, and the weekly decisions easy to scan.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricTile
            detail="Each player belongs to one manager at a time."
            label="Ownership"
            value="Exclusive"
          />
          <MetricTile
            detail="Draft night stays central to the room."
            label="Draft"
            tone="brand"
            value="Snake draft"
          />
          <MetricTile
            detail="The league status stays visible before every key action."
            label="Status"
            tone="accent"
            value={leagueDetails.league.status}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              detail: "One manager gets the player. Every claim has consequences.",
              icon: Crown,
              title: "Scarcity",
            },
            {
              detail: "The draft clock keeps the room moving before and during the live draft.",
              icon: Clock3,
              title: "Draft night",
            },
            {
              detail: "Lineups, waivers, and matchups keep the room moving every week.",
              icon: Sparkles,
              title: "Weekly play",
            },
          ].map((beat) => (
            <div
              key={beat.title}
              className="rounded-[1.35rem] border border-white/12 bg-black/18 px-4 py-4"
            >
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#ffd5e5]">
                <beat.icon className="size-3.5" />
                {beat.title}
              </p>
              <p className="mt-3 text-sm leading-6 text-white/78">{beat.detail}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            className={getButtonClassName({
              variant: "primary",
            })}
            href={primaryActionHref}
          >
            {primaryActionLabel}
          </Link>
          <Link
            className={getButtonClassName({
              variant: "secondary",
            })}
            href={secondaryActionHref}
          >
            {secondaryActionLabel}
          </Link>
        </div>
      </div>
    </SurfaceCard>
  );
}
