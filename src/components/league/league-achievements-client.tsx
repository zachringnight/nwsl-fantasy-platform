"use client";

import { useEffect, useState } from "react";
import {
  Award,
  Crown,
  Flame,
  Medal,
  MessageCircle,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { MetricTile } from "@/components/ui/metric-tile";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Pill } from "@/components/ui/pill";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import {
  getAllAchievementKeys,
  getAchievementMeta,
  loadLeagueAchievements,
  loadMyAchievements,
  loadStreaks,
} from "@/lib/fantasy-achievements";
import type { AchievementKey, AchievementRecord, StreakRecord } from "@/types/fantasy";

const iconMap: Record<string, LucideIcon> = {
  crown: Crown,
  flame: Flame,
  fire: Flame,
  rocket: Rocket,
  target: Target,
  trophy: Trophy,
  star: Star,
  zap: Zap,
  "rotate-ccw": RotateCcw,
  medal: Medal,
  "shield-check": ShieldCheck,
  award: Award,
  handshake: Award,
  "message-circle": MessageCircle,
};

export interface LeagueAchievementsClientProps {
  leagueId: string;
}

export function LeagueAchievementsClient({ leagueId }: LeagueAchievementsClientProps) {
  const { session } = useFantasyAuth();
  const [myAchievements, setMyAchievements] = useState<AchievementRecord[]>([]);
  const [leagueAchievements, setLeagueAchievements] = useState<AchievementRecord[]>([]);
  const [streaks, setStreaks] = useState<StreakRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [my, league, streakData] = await Promise.all([
          loadMyAchievements(leagueId),
          loadLeagueAchievements(leagueId),
          loadStreaks(leagueId, session!.user.id),
        ]);

        if (!cancelled) {
          setMyAchievements(my);
          setLeagueAchievements(league);
          setStreaks(streakData);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    return () => { cancelled = true; };
  }, [leagueId, session]);

  const allKeys = getAllAchievementKeys();
  const earnedKeys = new Set(myAchievements.map((a) => a.key));
  const winStreak = streaks.find((s) => s.streak_type === "win");

  return (
    <FantasyAuthGate
      loadingDescription="Loading."
      loadingTitle="Checking your account"
      signedOutDescription="Sign in to view achievements."
      signedOutTitle="Sign in"
    >
      {() => {
        if (isLoading) {
          return <EmptyState title="Loading achievements" description="Checking your badges and streaks." />;
        }

        return (
          <section className="space-y-5">
            <MotionReveal>
              <SurfaceCard
                eyebrow="Your progress"
                title="Badges and streaks"
                description="Unlock badges by hitting milestones. Your streaks track consecutive wins."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricTile
                    label="Badges earned"
                    value={`${myAchievements.length} / ${allKeys.length}`}
                    detail="Unlock them all to prove you're the best."
                    tone="brand"
                  />
                  <MetricTile
                    label="Win streak"
                    value={winStreak?.current_count ?? 0}
                    detail={winStreak ? `Best: ${winStreak.best_count}` : "Start winning to build a streak."}
                    tone="accent"
                  />
                  <MetricTile
                    label="League activity"
                    value={leagueAchievements.length}
                    detail="Total badges earned across all managers."
                  />
                </div>
              </SurfaceCard>
            </MotionReveal>

            <MotionReveal delay={60}>
              <SurfaceCard
                eyebrow="Badge wall"
                title="All badges"
                description="Locked badges show what you still need to unlock."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {allKeys.map((key) => {
                    const meta = getAchievementMeta(key);
                    const earned = earnedKeys.has(key);
                    const Icon = iconMap[meta.icon] ?? Award;

                    return (
                      <ScrollReveal key={key}>
                        <div
                          className={[
                            "rounded-[1.2rem] border px-4 py-4 transition",
                            earned
                              ? "border-brand/35 bg-brand/8"
                              : "border-line bg-white/4 opacity-50",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={[
                                "inline-flex size-11 shrink-0 items-center justify-center rounded-[1rem] border",
                                earned
                                  ? "border-brand-strong/30 bg-brand/14 text-brand-strong"
                                  : "border-line bg-white/6 text-muted",
                              ].join(" ")}
                            >
                              <Icon className="size-5" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                                {earned ? <Pill tone="success">Earned</Pill> : <Pill tone="default">Locked</Pill>}
                              </div>
                              <p className="mt-1 text-sm text-muted">{meta.description}</p>
                            </div>
                          </div>
                        </div>
                      </ScrollReveal>
                    );
                  })}
                </div>
              </SurfaceCard>
            </MotionReveal>

            {leagueAchievements.length > 0 ? (
              <MotionReveal delay={120}>
                <SurfaceCard
                  eyebrow="League feed"
                  title="Recent badges in this league"
                  description="See what your rivals have unlocked."
                  tone="accent"
                >
                  <div className="space-y-3">
                    {leagueAchievements.slice(0, 10).map((achievement) => (
                      <div
                        key={achievement.id}
                        className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-line bg-panel-soft px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{achievement.label}</p>
                          <p className="mt-0.5 text-sm text-muted">{achievement.description}</p>
                        </div>
                        <time className="shrink-0 text-[0.68rem] text-muted">
                          {new Date(achievement.earned_at).toLocaleDateString()}
                        </time>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              </MotionReveal>
            ) : null}
          </section>
        );
      }}
    </FantasyAuthGate>
  );
}
