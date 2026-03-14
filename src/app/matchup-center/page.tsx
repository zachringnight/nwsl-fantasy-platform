import { Activity, CalendarRange, Shield, Zap } from "lucide-react";
import { ProtectedAppShell } from "@/components/common/protected-app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { fantasyPlayerPool } from "@/lib/fantasy-player-pool";
import {
  formatFantasySlateRange,
  getFantasySlateStatus,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";

const nextDailySlate = getFantasyTargetSlate("salary_cap_daily");
const nextWeeklySlate = getFantasyTargetSlate("salary_cap_weekly");
const featuredImpactPlayers = fantasyPlayerPool.slice(0, 5);

const liveMoments = [
  {
    label: "At lock",
    value: "Lineups freeze and every projection becomes the baseline to beat.",
  },
  {
    label: "During play",
    value: "Goals, assists, shots on target, saves, clean sheets, and defensive work move the board in real time.",
  },
  {
    label: "At final",
    value: "Totals settle as soon as the slate ends, with every swing traceable back to the exact player events.",
  },
];

const scoringEvents = [
  `Forward or midfielder goal: +${launchScoringRules.goal.FWD}`,
  `Defender or goalkeeper goal: +${launchScoringRules.goal.DEF}`,
  `Assist: +${launchScoringRules.assist}`,
  `Shot on target: +${launchScoringRules.shotOnTarget}`,
  `Chance created: +${launchScoringRules.chanceCreated}`,
  `Save: +${launchScoringRules.save}`,
  `Goalkeeper clean sheet: +${launchScoringRules.cleanSheet.GK}`,
  `Yellow card: ${launchScoringRules.yellowCard}`,
];

export default function MatchupCenterPage() {
  return (
    <ProtectedAppShell
      eyebrow="Matchup Center"
      title="Follow every score as it happens"
      description="Live scoring from lock to final whistle."
      signedOutDescription="Sign in before opening the matchup center."
      signedOutTitle="Sign in to continue"
    >
      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard
          eyebrow="Live rhythm"
          title={getFantasySlateStatus(nextDailySlate) === "live" ? "A slate is live now" : "The next slate is already mapped"}
          description="Always know when scoring starts and when it settles."
        >
          <div className="grid gap-3">
            <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <CalendarRange className="size-4" />
                Daily slate
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatFantasySlateRange(nextDailySlate)}
              </p>
              <p className="mt-1 text-sm text-muted">
                Locks {new Date(nextDailySlate.lock_at).toLocaleString()}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Activity className="size-4" />
                Weekly slate
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatFantasySlateRange(nextWeeklySlate)}
              </p>
              <p className="mt-1 text-sm text-muted">
                Covers {nextWeeklySlate.slate_keys.length} matchdays in one scoring cycle
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {liveMoments.map((moment) => (
                <div
                  key={moment.label}
                  className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3"
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    {moment.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted">{moment.value}</p>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Impact players"
          title="These names can swing a slate in minutes"
          description="Top-ranked players with the biggest upside."
        >
          <div className="space-y-3">
            {featuredImpactPlayers.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{player.display_name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {player.club_name} • {player.position}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {player.average_points.toFixed(1)} pts
                  </p>
                  <p className="mt-1 text-sm text-muted">${player.salary_cost}</p>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="What moves scores"
          title="Key scoring events"
          description="Goals, creation, shot quality, and defensive actions all count."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {scoringEvents.map((event) => (
              <div
                key={event}
                className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 text-sm text-muted"
              >
                {event}
              </div>
            ))}
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Why it matters"
          title="A calm read beats a noisy scoreboard"
          description="See what changed, who caused it, and how your lineup is tracking."
          tone="accent"
        >
          <div className="space-y-3">
            <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Zap className="size-4 text-brand-strong" />
                Faster pivots before lock
              </p>
              <p className="mt-2 text-sm text-muted">
                Projection, salary, and slate timing stay visible while you build.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Shield className="size-4 text-brand-strong" />
                Trustworthy score movement
              </p>
              <p className="mt-2 text-sm text-muted">
                Every jump or drop maps back to a known scoring event instead of a black-box total.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </ProtectedAppShell>
  );
}
