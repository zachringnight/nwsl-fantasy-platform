import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import {
  formatFantasySlateRange,
  getFantasySlateWindows,
} from "@/lib/fantasy-slate-engine";

const firstWeeklySlate = getFantasySlateWindows("salary_cap_weekly")[0];
const firstDailySlate = getFantasySlateWindows("salary_cap_daily")[0];
const seasonSlate = getFantasySlateWindows("salary_cap_season_long")[0];

export default function DashboardPage() {
  return (
    <AppShell
      eyebrow="Dashboard"
      title="Every league, lock, and next move in one board"
      description="See draft rooms, lineup work, salary-cap locks, and league actions in one place."
    >
      <section className="grid gap-5 lg:grid-cols-3">
        <SurfaceCard
          eyebrow="Weekly timing"
          title={firstWeeklySlate?.label ?? "Week 1"}
          description={
            firstWeeklySlate
              ? `${formatFantasySlateRange(firstWeeklySlate)} • locks ${new Date(firstWeeklySlate.lock_at).toLocaleString()}`
              : "Weekly slate data unavailable."
          }
        />
        <SurfaceCard
          eyebrow="Daily timing"
          title={firstDailySlate?.label ?? "Opening slate"}
          description={
            firstDailySlate
              ? `${formatFantasySlateRange(firstDailySlate)} • real matchday window`
              : "Daily slate data unavailable."
          }
        />
          <SurfaceCard
          eyebrow="Season lock"
          title={seasonSlate?.label ?? "2026 Season"}
          description={
            seasonSlate
              ? `${new Date(seasonSlate.lock_at).toLocaleString()} • single-entry season cap lock`
              : "Season timing unavailable."
          }
          tone="accent"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <DashboardClient />

        <SurfaceCard
          eyebrow="At a glance"
          title="What deserves attention today"
          description="Check what locks first, which league needs work, and whether you have an action waiting."
          tone="accent"
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <p>League cards lead with the next action, not vanity stats.</p>
            <p>Salary-cap contests always point to the live or upcoming slate.</p>
            <p>Classic leagues route straight into draft, lineup, matchup, or waivers.</p>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
