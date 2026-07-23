"use client";

import Link from "next/link";
import { Lock, Trophy, TrendingUp } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { getButtonClassName } from "@/components/ui/button";
import type { FantasySalaryCapLeaderboardState } from "@/types/fantasy";

export interface SalaryCapLeaderboardProps {
  leaderboard: FantasySalaryCapLeaderboardState;
  modeDescription: string;
  playersHref: string;
  teamHref: string;
}

export function SalaryCapLeaderboard({
  leaderboard,
  modeDescription,
  playersHref,
  teamHref,
}: SalaryCapLeaderboardProps) {
  const userEntry = leaderboard.entries.find(
    (entry) => entry.user_id === leaderboard.current_user_id
  );
  const scoreStatus = leaderboard.entries[0]?.score_status ?? "projected";
  const lockStatus =
    scoreStatus === "projected"
      ? "Open"
      : scoreStatus === "live"
        ? "Locked"
        : "Final";

  return (
    <section className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-4">
        <MetricTile
          label="Your rank"
          value={userEntry ? `#${userEntry.rank}` : "—"}
          detail={userEntry ? userEntry.entry_name : "No submitted entry"}
          tone="brand"
        />
        <MetricTile
          label="Your points"
          value={userEntry ? userEntry.total_points.toFixed(1) : "—"}
          detail={
            userEntry?.is_approximated
              ? `${scoreStatus} • estimated inputs`
              : `${scoreStatus} score`
          }
        />
        <MetricTile
          label="Field size"
          value={leaderboard.entries.length}
          detail="Submitted entries in this slate."
        />
        <MetricTile
          label="Lock status"
          value={lockStatus}
          detail={leaderboard.slate.label}
          tone="accent"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="Contest leaderboard"
          title="Real slate standings"
          description="Submitted entries ranked from official fantasy point snapshots."
        >
          {leaderboard.entries.length === 0 ? (
            <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-muted">
              No entries have been submitted for this slate.
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.entries.map((entry) => (
                <div
                  key={entry.entry_id}
                  className={[
                    "flex items-center justify-between rounded-[1.2rem] border p-4",
                    entry.user_id === leaderboard.current_user_id
                      ? "border-brand/40 bg-brand/10"
                      : "border-line bg-white/6",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 text-center font-display text-2xl font-semibold text-foreground">
                      {entry.rank}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">
                        {entry.entry_name}
                        {entry.user_id === leaderboard.current_user_id ? (
                          <span className="ml-2 text-xs text-brand-strong">You</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted">
                        {entry.manager_name}
                        {entry.top_scorer ? ` • top: ${entry.top_scorer}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {entry.total_points.toFixed(1)} pts
                    </p>
                    <Pill tone={entry.is_approximated ? "accent" : "brand"}>
                      {entry.is_approximated ? "estimated" : entry.score_status}
                    </Pill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard
            eyebrow="Score drivers"
            title="Top real scorers"
            description="Highest point totals represented across submitted entries."
            tone="accent"
          >
            {leaderboard.score_drivers.length === 0 ? (
              <p className="text-sm text-muted">
                Official snapshots have not landed yet; leaderboard totals are projected.
              </p>
            ) : (
              <div className="space-y-2">
                {leaderboard.score_drivers.map((driver) => (
                  <div
                    key={driver.player_id}
                    className="flex items-center justify-between rounded-[1.2rem] border border-line bg-white/6 p-4"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {driver.player_name}
                        <span className="ml-2 text-xs text-muted">
                          {driver.player_position}
                        </span>
                      </p>
                      <p className="text-sm text-muted">
                        {driver.is_approximated ? "Estimated inputs included" : "Official inputs"}
                      </p>
                    </div>
                    <span className="font-semibold text-foreground">
                      {driver.points.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Slate status"
            title="Lock, score, settle"
            description={modeDescription}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Pill tone="brand"><Lock className="size-3.5" /> {lockStatus}</Pill>
              <Pill tone="accent"><Trophy className="size-3.5" /> {leaderboard.entries.length} entries</Pill>
              <Pill><TrendingUp className="size-3.5" /> {scoreStatus}</Pill>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className={getButtonClassName()} href={teamHref}>
                Open entry hub
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
