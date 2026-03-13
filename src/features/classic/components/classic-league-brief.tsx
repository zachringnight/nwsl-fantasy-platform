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
      description={`${description} • League code ${leagueDetails.league.code} • ${leagueDetails.memberships.length}/${leagueDetails.league.manager_count_target} managers`}
      eyebrow="Classic overview"
      title={leagueDetails.league.name}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Pill tone="brand">Code {leagueDetails.league.code}</Pill>
          <Pill tone="default">
            {leagueDetails.memberships.length}/{leagueDetails.league.manager_count_target} managers
          </Pill>
          {leagueDetails.currentMembership?.team_name ? (
            <Pill tone="success">{leagueDetails.currentMembership.team_name}</Pill>
          ) : null}
        </div>

        <p className="text-sm leading-6 text-muted">
          Exclusive ownership, weekly lineup pressure, and matchup consequences all stay visible in one classic league view.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricTile
            detail="Every player belongs to one manager at a time."
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
            detail="The room status stays visible before every next move."
            label="Status"
            tone="accent"
            value={leagueDetails.league.status}
          />
        </div>

        <div className="rounded-[1.45rem] border border-line bg-white/6 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
            League pulse
          </p>
          <p className="mt-3 text-base leading-7 text-foreground">
            Draft night anchors the room. Once the player pool turns exclusive, every lineup, waiver, and matchup decision has real scarcity behind it.
          </p>
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
