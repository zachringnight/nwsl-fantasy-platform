import Link from "next/link";
import { ArrowRight, CalendarRange, Crown, Goal, Sparkles } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { fantasyPlayerPool } from "@/lib/fantasy-player-pool";
import {
  formatFantasySlateRange,
  getFantasyTargetSlate,
} from "@/lib/fantasy-slate-engine";

const leagueModes = [
  {
    eyebrow: "Classic",
    title: "Season-long private league",
    description:
      "Draft exclusive rosters, set lineups every matchweek, and chase the table with friends all season.",
  },
  {
    eyebrow: "Season cap",
    title: "Season-long salary cap",
    description:
      "Build one shared-pool roster under the cap and ride the full season with no draft required.",
  },
  {
    eyebrow: "Weekly cap",
    title: "Weekly salary-cap slate",
    description:
      "Rebuild for each weekly window with one entry, clear lock timing, and fast score tracking.",
  },
  {
    eyebrow: "Daily cap",
    title: "Daily matchday slate",
    description:
      "Play the same day’s matches only, react to team news, and chase short-window upside.",
  },
];

const nextWeeklySlate = getFantasyTargetSlate("salary_cap_weekly");
const nextDailySlate = getFantasyTargetSlate("salary_cap_daily");
const featuredMarket = fantasyPlayerPool.slice(0, 3);

export default function LeaguesPage() {
  return (
    <AppShell
      eyebrow="Leagues"
      title="Start or join a league"
      description="Pick your format, invite friends, and get playing."
      actions={
        <div className="flex gap-3">
          <Link
            href="/leagues/create"
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Create league
          </Link>
          <Link
            href="/leagues/join"
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground"
          >
            Join league
          </Link>
        </div>
      }
    >
      <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        {leagueModes.map((mode) => (
          <SurfaceCard
            key={mode.title}
            eyebrow={mode.eyebrow}
            title={mode.title}
            description={mode.description}
          />
        ))}
      </section>

      <SurfaceCard
        eyebrow="Choose your rhythm"
        title="Pick the pace that fits your group"
        description="One draft all season, one lineup per week, or one lineup per day."
      >
        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[1.4rem] border border-line bg-panel-soft p-4">
            <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand">
              <CalendarRange className="size-4" />
              Next weekly lock
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatFantasySlateRange(nextWeeklySlate)}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Weekly contests lock at {new Date(nextWeeklySlate.lock_at).toLocaleString()} and settle after every match in the window finishes.
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-line bg-panel-soft p-4">
            <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand">
              <Goal className="size-4" />
              Next daily lock
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatFantasySlateRange(nextDailySlate)}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Daily slates let you play a single matchday window with the same scoring model and the same player board.
            </p>
          </div>
        </div>
      </SurfaceCard>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="How entry works"
          title="Create or join in three steps"
          description="Every rule is visible before you commit."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.2rem] border border-line bg-panel-soft p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Crown className="size-4" />
                Start
              </p>
              <p className="mt-2 text-sm text-muted">
                Choose the format, set league size, and share a short invite code.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-panel-soft p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Sparkles className="size-4" />
                Review
              </p>
              <p className="mt-2 text-sm text-muted">
                See draft style, roster control, and score cadence before you enter.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-panel-soft p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <ArrowRight className="size-4" />
                Play
              </p>
              <p className="mt-2 text-sm text-muted">
                Land straight on the next action: draft prep, lineup build, matchup, or waiver work.
              </p>
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Top market"
          title="Start with the names everyone will chase"
          description="The same rankings power every format."
        >
          <div className="space-y-3">
            {featuredMarket.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    #{player.rank} {player.display_name}
                  </p>
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
    </AppShell>
  );
}
