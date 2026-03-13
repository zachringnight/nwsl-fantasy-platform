import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Crown,
  Flame,
  Goal,
  Radar,
  Sparkles,
  Trophy,
  Waves,
} from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { fantasyPlayerPool } from "@/lib/fantasy-player-pool";
import {
  formatFantasySlateRange,
  getFantasySlateStatus,
  getFantasyTargetSlate,
  getFantasySlateWindows,
} from "@/lib/fantasy-slate-engine";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";

const experiencePillars = [
  {
    eyebrow: "Classic leagues",
    title: "Private leagues built for real rivalries",
    description:
      "Set a draft time, invite your group, and play weekly head-to-head matchups with clear rules and live scoring.",
  },
  {
    eyebrow: "Weekly contests",
    title: "Salary-cap lineups with clear lock times",
    description:
      "Build one lineup, watch the slate window, and make changes right up to lock when the news changes.",
  },
  {
    eyebrow: "Matchday pulse",
    title: "Live scoring you can follow at a glance",
    description:
      "See scores, swings, and key match events in one place without digging through menus.",
  },
];

const firstDailySlate = getFantasySlateWindows("salary_cap_daily")[0];
const finalDailySlate = getFantasySlateWindows("salary_cap_daily").at(-1);
const weeklySlateCount = getFantasySlateWindows("salary_cap_weekly").length;
const currentDailySlate = getFantasyTargetSlate("salary_cap_daily");
const currentWeeklySlate = getFantasyTargetSlate("salary_cap_weekly");
const featuredPlayers = fantasyPlayerPool.slice(0, 4);

const scoringAnchors = [
  {
    label: "Attack",
    value: `${launchScoringRules.goal.FWD} for a forward goal`,
  },
  {
    label: "Creation",
    value: `${launchScoringRules.assist} assist • ${launchScoringRules.chanceCreated} chance created`,
  },
  {
    label: "Pressure",
    value: `${launchScoringRules.shotOnTarget} shot on target • ${launchScoringRules.successfulCross} cross`,
  },
  {
    label: "Defense",
    value: `${launchScoringRules.cleanSheet.GK} clean sheet • ${launchScoringRules.save} per save`,
  },
];

function formatSlateStatusLabel() {
  const status = getFantasySlateStatus(currentDailySlate);

  if (status === "live") {
    return "Live now";
  }

  if (status === "complete") {
    return "Recently settled";
  }

  return "Next to lock";
}

export default function Home() {
  return (
    <AppShell
      eyebrow="NWSL fantasy"
      title="Fantasy for every NWSL match window"
      description="Season-long leagues, weekly contests, and daily slates — all in one place."
      actions={
        <div className="flex flex-wrap gap-3">
          <Link
            href="/leagues/create"
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
          >
            Start a league
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/players"
            className="rounded-full border border-line bg-white/6 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
          >
            Scout players
          </Link>
        </div>
      }
    >
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SurfaceCard
          eyebrow="Play now"
          title="Draft nights, weekly contests, and daily slates"
          description="Pick the format that fits you. Every mode shares the same player board and scoring."
          tone="brand"
          className="section-fade"
        >
          <div className="grid gap-4 edge-frame">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/68">
                  Opening daily slate
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {firstDailySlate ? formatFantasySlateRange(firstDailySlate) : "Unavailable"}
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/68">
                  Weekly windows
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{weeklySlateCount} windows</p>
              </div>
              <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/68">
                  Final daily lock
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {finalDailySlate?.label ?? "Unavailable"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                  <Crown className="size-3.5" />
                  Classic
                </p>
                <p className="mt-2 text-sm leading-6 text-white/82">
                  Private leagues with weekly head-to-head standings and a live snake draft.
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                  <Flame className="size-3.5" />
                  Weekly cap
                </p>
                <p className="mt-2 text-sm leading-6 text-white/82">
                  One entry, one lock, one clear runway from scouting to submission for each scoring cycle.
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                  <Goal className="size-3.5" />
                  Daily
                </p>
                <p className="mt-2 text-sm leading-6 text-white/82">
                  Fast-turn contest windows built for casual sweats, same-day pivots, and late lineup drama.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-night px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-black"
              >
                Create account
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/leagues/join"
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
              >
                Join with code
              </Link>
            </div>
          </div>
        </SurfaceCard>

        <div className="grid gap-4 section-fade section-fade-delay-1">
          <SurfaceCard
            eyebrow="Contest calendar"
            title="Always know when entries lock"
            description="Lock times, slate windows, and deadlines — always visible."
          >
            <div className="space-y-3 text-sm text-muted">
              <div className="flex items-center gap-3">
                <CalendarRange className="size-4 text-brand-strong" />
                <p>Daily slates map cleanly to matchday windows.</p>
              </div>
              <div className="flex items-center gap-3">
                <Radar className="size-4 text-brand-strong" />
                <p>Weekly contests roll up the same schedule into one clear build cycle.</p>
              </div>
              <div className="flex items-center gap-3">
                <Trophy className="size-4 text-[#C5FF5F]" />
                <p>Season-long salary cap locks once and rides with you all year.</p>
              </div>
            </div>
          </SurfaceCard>
          <SurfaceCard
            eyebrow="Why it hits"
            title="Made for matchday, not menus"
            description="Deadlines stay visible, scores stay readable, and every important move is close at hand."
            tone="accent"
          >
            <div className="flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">deadline first</span>
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">mobile sharp</span>
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">easy to manage</span>
              <span className="rounded-full border border-line bg-white/6 px-3 py-1">matchday energy</span>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {experiencePillars.map((pillar, index) => (
          <SurfaceCard
            key={pillar.title}
            eyebrow={pillar.eyebrow}
            title={pillar.title}
            description={pillar.description}
            className={
              index === 0
                ? "section-fade"
                : index === 1
                  ? "section-fade section-fade-delay-1"
                  : "section-fade section-fade-delay-2"
            }
          >
            <div className="mt-2 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              {index === 0 ? (
                <Crown className="size-4" />
              ) : index === 1 ? (
                <Sparkles className="size-4" />
              ) : (
                <Waves className="size-4" />
              )}
              Ready for matchday
            </div>
          </SurfaceCard>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard
          eyebrow="Player market"
          title="Real NWSL players power every format"
          description="One player board with real clubs, positions, salaries, and projections."
          className="section-fade"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {featuredPlayers.map((player) => (
              <div
                key={player.id}
                className="rounded-[1.35rem] border border-line bg-panel-soft px-4 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                      #{player.rank} overall
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">{player.display_name}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {player.club_name} • {player.position}
                    </p>
                  </div>
                  <span className="rounded-full border border-brand/30 bg-brand/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-strong">
                    ${player.salary_cost}
                  </span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
                      Projection
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {player.average_points.toFixed(1)}
                    </p>
                  </div>
                  <Link
                    href={`/players/${player.id}`}
                    className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
                  >
                    View profile
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <div className="grid gap-5 section-fade section-fade-delay-1">
          <SurfaceCard
            eyebrow="Scoring clarity"
            title="A score that feels like soccer"
            description="Goals matter, but creation, pressure, defending, and goalkeeper work all move your total in visible ways."
          >
            <div className="grid gap-3">
              {scoringAnchors.map((anchor) => (
                <div
                  key={anchor.label}
                  className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3"
                >
                  <p className="text-sm font-semibold text-foreground">{anchor.label}</p>
                  <p className="text-sm text-muted">{anchor.value}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard
            eyebrow="Live runway"
            title={`${formatSlateStatusLabel()} for matchday`}
            description="Lock times stay visible before kickoff, during the slate, and after scores settle."
          >
            <div className="grid gap-3">
              <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Daily
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatFantasySlateRange(currentDailySlate)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Locks {new Date(currentDailySlate.lock_at).toLocaleString()}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Weekly
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatFantasySlateRange(currentWeeklySlate)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  One build cycle across {currentWeeklySlate.slate_keys.length} matchdays
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                Open dashboard
              </Link>
              <Link
                href="/rules"
                className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground hover:border-brand-strong/40 hover:text-brand-strong"
              >
                Full scoring rules
              </Link>
            </div>
          </SurfaceCard>
        </div>
      </section>
    </AppShell>
  );
}
