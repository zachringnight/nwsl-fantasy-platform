"use client";

import Link from "next/link";
import { Clock3, Lock, Trophy, Users } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { getButtonClassName } from "@/components/ui/button";

export interface SalaryCapMatchupPlaceholderProps {
  entryLabel: string | null;
  leagueCode: string;
  managerCount: number;
  managerTarget: number;
  modeDescription: string;
  playersHref: string;
  salaryCapAmount: number | null;
  slateLabel: string;
  slateLockLabel: string;
  slateRangeLabel: string;
  slateStatus: "upcoming" | "live" | "complete";
  teamHref: string;
}

export function SalaryCapMatchupPlaceholder({
  entryLabel,
  leagueCode,
  managerCount,
  managerTarget,
  modeDescription,
  playersHref,
  salaryCapAmount,
  slateLabel,
  slateLockLabel,
  slateRangeLabel,
  slateStatus,
  teamHref,
}: SalaryCapMatchupPlaceholderProps) {
  const slateStatusLabel =
    slateStatus === "live"
      ? "Live"
      : slateStatus === "complete"
        ? "Final"
        : "Upcoming";

  return (
    <section className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-4">
        <MetricTile
          label="Current slate"
          value={slateLabel}
          detail={slateRangeLabel}
          tone="brand"
        />
        <MetricTile
          label="Slate status"
          value={slateStatusLabel}
          detail={`Locks ${slateLockLabel}`}
        />
        <MetricTile
          label="Managers"
          value={`${managerCount}/${managerTarget}`}
          detail={`League code ${leagueCode}`}
        />
        <MetricTile
          label="Salary cap"
          value={`$${salaryCapAmount ?? 0}`}
          detail={entryLabel ? `Entry: ${entryLabel}` : "Shared-pool contest format"}
          tone="accent"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="Contest overview"
          title="Salary-cap leagues do not use head-to-head matchups"
          description={modeDescription}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill tone="brand">{slateLabel}</Pill>
              <Pill tone="default">{managerCount} managers</Pill>
              {entryLabel ? <Pill tone="success">{entryLabel}</Pill> : null}
            </div>

            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-7 text-foreground">
              This page summarizes the active slate and points you to the right tools. Contest ranking is based on the full field, not one opponent, so there is no weekly head-to-head matchup screen for salary-cap formats.
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  <Lock className="size-3.5" />
                  Before lock
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  Build or edit your entry from the team page before the slate locks.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  <Clock3 className="size-3.5" />
                  While live
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  Follow the slate window and return to your entry page for updates as matches progress.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  <Trophy className="size-3.5" />
                  After final
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  Final contest results settle after the slate completes.
                </p>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard
            eyebrow="Use these pages"
            title="Open your entry and player board"
            description="Manage your salary-cap lineup from the dedicated entry flow."
            tone="accent"
          >
            <div className="space-y-3">
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  <Trophy className="size-3.5" />
                  Entry page
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  Review your lineup, save changes before lock, and return here once the slate is settled.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  <Users className="size-3.5" />
                  Player board
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  Browse salaries, projections, and availability before you lock in your roster.
                </p>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Next actions"
            title="Go where the real contest tools live"
            description="Use the entry page for roster decisions and the player board for research."
          >
            <div className="flex flex-wrap gap-3">
              <Link className={getButtonClassName()} href={teamHref}>
                Open entry page
              </Link>
              <Link
                className={getButtonClassName({ variant: "secondary" })}
                href={playersHref}
              >
                Browse player salaries
              </Link>
            </div>
          </SurfaceCard>
        </div>
      </div>
    </section>
  );
}
