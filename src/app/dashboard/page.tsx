import { ProtectedAppShell } from "@/components/common/protected-app-shell";
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
    <ProtectedAppShell
      eyebrow="Dashboard"
      title="Your leagues, locks, and upcoming actions"
      description="Everything you need to manage in one place."
      signedOutDescription="Sign in before opening your dashboard."
      signedOutTitle="Sign in to continue"
    >
      <section className="grid gap-5 lg:grid-cols-3">
        <SurfaceCard
          eyebrow="Weekly"
          title={firstWeeklySlate?.label ?? "Week 1"}
          description={
            firstWeeklySlate
              ? `${formatFantasySlateRange(firstWeeklySlate)} • locks ${new Date(firstWeeklySlate.lock_at).toLocaleString()}`
              : "No weekly slate scheduled yet."
          }
        />
        <SurfaceCard
          eyebrow="Daily"
          title={firstDailySlate?.label ?? "Opening slate"}
          description={
            firstDailySlate
              ? `${formatFantasySlateRange(firstDailySlate)} • matchday window`
              : "No daily slate scheduled yet."
          }
        />
          <SurfaceCard
          eyebrow="Season"
          title={seasonSlate?.label ?? "2026 Season"}
          description={
            seasonSlate
              ? `Locks ${new Date(seasonSlate.lock_at).toLocaleString()}`
              : "Season lock not set yet."
          }
          tone="accent"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <DashboardClient />

        <SurfaceCard
          eyebrow="How it works"
          title="Your next action is easy to find"
          description="Each league card shows what needs attention right now."
          tone="accent"
        >
          <div className="space-y-3">
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3 text-sm">
              <p className="font-semibold text-foreground">Classic leagues</p>
              <p className="mt-1 text-muted">Jump straight into your draft, lineup, matchup, or waivers.</p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3 text-sm">
              <p className="font-semibold text-foreground">Salary-cap contests</p>
              <p className="mt-1 text-muted">Always pointing to the live or upcoming slate.</p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </ProtectedAppShell>
  );
}
