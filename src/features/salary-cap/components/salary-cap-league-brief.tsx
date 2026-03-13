import Link from "next/link";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import type { FantasyLeagueDetails, FantasySlateWindow } from "@/types/fantasy";

export interface SalaryCapLeagueBriefProps {
  description?: string;
  leagueDetails: FantasyLeagueDetails;
  primaryActionHref: string;
  primaryActionLabel: string;
  secondaryActionHref: string;
  secondaryActionLabel: string;
  slate: FantasySlateWindow;
  title?: string;
}

export function SalaryCapLeagueBrief({
  description = "Shared-pool salary-cap play keeps the active slate, cap pressure, and next actions visible right away.",
  leagueDetails,
  primaryActionHref,
  primaryActionLabel,
  secondaryActionHref,
  secondaryActionLabel,
  slate,
  title,
}: SalaryCapLeagueBriefProps) {
  return (
    <SurfaceCard
      description={`${leagueDetails.league.game_variant.replaceAll("_", " ")} • ${leagueDetails.memberships.length}/${leagueDetails.league.manager_count_target} managers • League code ${leagueDetails.league.code}`}
      eyebrow="Salary-cap overview"
      title={title ?? leagueDetails.league.name}
      tone="brand"
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

        <p className="text-sm leading-6 text-white/78">{description}</p>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricTile
            detail="Your entry always points to the current contest window."
            label="Active slate"
            tone="brand"
            value={slate.label}
          />
          <MetricTile
            detail="Every single-entry build stays under the shared budget."
            label="Cap"
            tone="brand"
            value={`$${leagueDetails.league.salary_cap_amount ?? 0}`}
          />
          <MetricTile
            detail="Submission and lock follow the slate, not the page."
            label="Lock"
            tone="accent"
            value={new Date(slate.lock_at).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          />
        </div>

        <div className="rounded-[1.45rem] border border-white/12 bg-black/18 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/72">
            Slate pressure
          </p>
          <p className="mt-3 text-base leading-7 text-white/86">
            Every build points to a single clean window. Scout the board, commit once, and keep the entire contest anchored to the live slate instead of a generic season screen.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            className={getButtonClassName({
              className: "bg-white text-night hover:bg-brand-lime hover:text-night",
              variant: "primary",
            })}
            href={primaryActionHref}
          >
            {primaryActionLabel}
          </Link>
          <Link
            className={getButtonClassName({
              className: "border-white/16 bg-white/6 text-white hover:border-white/28 hover:bg-white/12",
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
