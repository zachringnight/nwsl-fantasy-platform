"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Lock,
  Minus,
  Sparkles,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { getButtonClassName } from "@/components/ui/button";

export interface SalaryCapMatchupPlaceholderProps {
  modeDescription: string;
  playersHref: string;
  teamHref: string;
}

interface SlateEntry {
  rank: number;
  previousRank: number;
  totalPoints: number;
  entryName: string;
  isUser: boolean;
}

interface ScoreDriver {
  playerName: string;
  position: string;
  points: number;
  trend: "up" | "down" | "flat";
  status: string;
}

const mockEntries: SlateEntry[] = [
  { rank: 1, previousRank: 2, totalPoints: 87.4, entryName: "Rose City Press", isUser: false },
  { rank: 2, previousRank: 1, totalPoints: 84.1, entryName: "My Primary Entry", isUser: true },
  { rank: 3, previousRank: 3, totalPoints: 79.8, entryName: "Spirit Surge", isUser: false },
  { rank: 4, previousRank: 6, totalPoints: 74.2, entryName: "Bay Bombers", isUser: false },
  { rank: 5, previousRank: 4, totalPoints: 71.5, entryName: "Gotham Grit", isUser: false },
];

const mockDrivers: ScoreDriver[] = [
  { playerName: "Sophia Smith", position: "FWD", points: 22.5, trend: "up", status: "2 goals, 1 assist" },
  { playerName: "Sam Coffey", position: "MID", points: 14.8, trend: "up", status: "1 goal, 4 chances created" },
  { playerName: "Emily Fox", position: "DEF", points: 11.2, trend: "flat", status: "Clean sheet, 3 tackles" },
  { playerName: "Alyssa Naeher", position: "GK", points: 9.5, trend: "down", status: "4 saves, 1 conceded" },
];

type LockStatus = "editable" | "locked" | "final";

export function SalaryCapMatchupPlaceholder({
  modeDescription,
  playersHref,
  teamHref,
}: SalaryCapMatchupPlaceholderProps) {
  const [lockStatus] = useState<LockStatus>("locked");
  const [elapsedMinutes, setElapsedMinutes] = useState(67);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes((prev) => (prev < 90 ? prev + 1 : prev));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const userEntry = mockEntries.find((e) => e.isUser);
  const fieldSize = mockEntries.length;

  const TrendIcon = ({ trend }: { trend: "up" | "down" | "flat" }) => {
    if (trend === "up") return <ArrowUp className="size-3.5 text-brand-lime" />;
    if (trend === "down") return <ArrowDown className="size-3.5 text-danger" />;
    return <Minus className="size-3.5 text-muted" />;
  };

  return (
    <section className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-4">
        <MetricTile
          label="Your rank"
          value={userEntry ? `#${userEntry.rank}` : "—"}
          detail={
            userEntry
              ? userEntry.rank < userEntry.previousRank
                ? `Up from #${userEntry.previousRank}`
                : userEntry.rank > userEntry.previousRank
                  ? `Down from #${userEntry.previousRank}`
                  : "Holding position"
              : "No entry submitted"
          }
          tone="brand"
        />
        <MetricTile
          label="Your points"
          value={userEntry ? userEntry.totalPoints.toFixed(1) : "—"}
          detail="Live projected total."
        />
        <MetricTile
          label="Field size"
          value={fieldSize}
          detail="Active entries in this slate."
        />
        <MetricTile
          label="Lock status"
          value={
            lockStatus === "editable"
              ? "Open"
              : lockStatus === "locked"
                ? "Locked"
                : "Final"
          }
          detail={
            lockStatus === "editable"
              ? "Entry is still editable."
              : lockStatus === "locked"
                ? `Match minute ${elapsedMinutes}`
                : "Slate is settled."
          }
          tone="accent"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="Contest leaderboard"
          title="Slate rank movement"
          description="Track your entry against the field in real time as fixtures progress."
        >
          <div className="space-y-2">
            {mockEntries.map((entry) => {
              const moved = entry.previousRank - entry.rank;
              return (
                <div
                  key={entry.entryName}
                  className={[
                    "flex items-center justify-between rounded-[1.2rem] border p-4 transition",
                    entry.isUser
                      ? "border-brand/40 bg-brand/10"
                      : "border-line bg-white/6",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 text-center font-display text-2xl font-semibold leading-none text-foreground">
                      {entry.rank}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">
                        {entry.entryName}
                        {entry.isUser && (
                          <span className="ml-2 text-xs text-brand-strong">You</span>
                        )}
                      </p>
                      <p className="text-sm text-muted">{entry.totalPoints.toFixed(1)} pts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {moved > 0 ? (
                      <Pill tone="success">
                        <ArrowUp className="size-3" />
                        {moved}
                      </Pill>
                    ) : moved < 0 ? (
                      <Pill tone="accent">
                        <ArrowDown className="size-3" />
                        {Math.abs(moved)}
                      </Pill>
                    ) : (
                      <Pill>
                        <Minus className="size-3" />
                      </Pill>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard
            eyebrow="Score drivers"
            title="Players moving your lineup"
            description="The players pushing your entry up or down right now."
            tone="accent"
          >
            <div className="space-y-2">
              {mockDrivers.map((driver) => (
                <div
                  key={driver.playerName}
                  className="flex items-center justify-between rounded-[1.2rem] border border-line bg-white/6 p-4"
                >
                  <div className="flex items-center gap-3">
                    <TrendIcon trend={driver.trend} />
                    <div>
                      <p className="font-semibold text-foreground">
                        {driver.playerName}
                        <span className="ml-2 text-xs text-muted">{driver.position}</span>
                      </p>
                      <p className="text-sm text-muted">{driver.status}</p>
                    </div>
                  </div>
                  <span className="font-semibold text-foreground">
                    {driver.points.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Slate status"
            title="Lock, climb, and final"
            description={modeDescription}
          >
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                  <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    <Lock className="size-3.5" />
                    Lock story
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    {lockStatus === "editable"
                      ? "Your entry is still open for edits until lock."
                      : lockStatus === "locked"
                        ? "Entry is locked. Scoring is live."
                        : "Slate is final. Results are settled."}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                  <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    <Trophy className="size-3.5" />
                    Contest
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    {userEntry
                      ? `Ranked #${userEntry.rank} of ${fieldSize} entries.`
                      : "No active entry for this slate."}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                  <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    <TrendingUp className="size-3.5" />
                    Momentum
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    {elapsedMinutes < 90
                      ? `Minute ${elapsedMinutes} — scoring still moving.`
                      : "Full time — waiting for final confirmation."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
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
            </div>
          </SurfaceCard>
        </div>
      </div>
    </section>
  );
}
