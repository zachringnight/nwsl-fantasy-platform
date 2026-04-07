import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radar, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { getPredictiveHubData } from "@/lib/analytics/predictive";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";

export const metadata: Metadata = {
  title: "NWSL Fantasy Soccer",
  description:
    "Use matchup previews, fair prices, fantasy projections, and player research tools for every NWSL slate.",
};

const researchPillars = [
  {
    eyebrow: "Matchup board",
    title: "Start with game scripts, not guesses",
    description: "See the strongest sides, best totals, clean-sheet spots, and fair prices before you touch a player pool.",
  },
  {
    eyebrow: "Player board",
    title: "Sort the slate by ceiling, value, and role",
    description: "Player rankings move with opponent strength, expected minutes, team environment, and shot or creation volume.",
  },
  {
    eyebrow: "Betting context",
    title: "Turn model probabilities into usable prices",
    description: "Keep the numbers actionable for fantasy decisions, prop research, and straight-match reads.",
  },
] as const;

const scoringAnchors = [
  {
    label: "Role",
    value: "Expected minutes, starting probability, and injury status drive the baseline.",
  },
  {
    label: "Attack",
    value: `${launchScoringRules.goal.FWD} for a forward goal, ${launchScoringRules.assist} per assist, plus chance creation and shot volume.`,
  },
  {
    label: "Defense",
    value: `${launchScoringRules.cleanSheet.GK} for keeper clean sheets, ${launchScoringRules.save} per save, and clean-sheet equity for defenders.`,
  },
  {
    label: "Environment",
    value: "Win chances, projected totals, and opponent resistance push players up or down before lock.",
  },
] as const;

function formatPercent(probability: number | null | undefined) {
  if (probability == null) {
    return "N/A";
  }

  return `${Math.round(probability * 100)}%`;
}

export default async function Home() {
  const data = await getPredictiveHubData();
  const featuredPlayers = data.predictive.playerBoard.slice(0, 4);
  const featuredMatchup = data.predictive.matchups[0] ?? null;
  const bestValue = data.predictive.bestValues[0] ?? null;
  const topCeiling = data.predictive.bestCeilings[0] ?? null;
  const safestFloor = data.predictive.safestFloors[0] ?? null;
  const propFavorite = data.predictive.propTargets[0] ?? null;

  return (
    <AppShell
      eyebrow="NWSL projections"
      title="Sharper NWSL reads for fantasy builds, prop angles, and matchup previews"
      description="Start with the slate context, move to the player board, and use fair prices and role-based projections to make better calls before kickoff."
      actions={
        <div className="flex flex-wrap gap-3">
          <Link
            href="/matchups"
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
          >
            Open matchup board
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/players"
            className="rounded-full border border-line bg-white/6 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
          >
            Browse player projections
          </Link>
        </div>
      }
    >
      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <SurfaceCard
          eyebrow="Research first"
          title="See the next slate before you pick a side or build a lineup"
          description="The board is organized around the things that actually move outcomes: projected totals, fair prices, clean-sheet leverage, and matchup-aware player ranges."
          tone="brand"
          className="section-fade"
        >
          <div className="grid gap-4 edge-frame">
            <div className="grid gap-3 md:grid-cols-4">
              {data.predictive.matchupBoard.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4"
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/78">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">{item.detail}</p>
                </div>
              ))}
            </div>

            {featuredMatchup ? (
              <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.5rem] border border-white/12 bg-black/20 p-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                    Featured matchup
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">
                    {featuredMatchup.homeTeam} vs {featuredMatchup.awayTeam}
                  </h2>
                  <p className="mt-2 text-sm text-white/72">
                    {featuredMatchup.matchDateLabel} • {featuredMatchup.tempoLabel} •{" "}
                    {featuredMatchup.volatilityLabel}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-white/82">
                    {featuredMatchup.summary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/72">
                    {featuredMatchup.angles.slice(0, 4).map((angle) => (
                      <span
                        key={`${featuredMatchup.matchKey}-${angle}`}
                        className="rounded-full border border-white/12 px-3 py-1"
                      >
                        {angle}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                      Home win
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatPercent(featuredMatchup.homeWinProb)}
                    </p>
                  </div>
                  <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                      Draw
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatPercent(featuredMatchup.drawProb)}
                    </p>
                  </div>
                  <div className="rounded-[1.35rem] border border-white/12 bg-black/16 p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                      Away win
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatPercent(featuredMatchup.awayWinProb)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-black/10 p-5 text-sm text-white/72">
                Upcoming fixtures are still loading. Once the next slate is available, this space
                will show the strongest game environment on the board.
              </div>
            )}
          </div>
        </SurfaceCard>

        <div className="grid gap-4 section-fade section-fade-delay-1">
          <SurfaceCard
            eyebrow="Quick answers"
            title="The fastest way to narrow the slate"
            description="Three high-signal calls to start with when time is short."
          >
            <div className="space-y-3 text-sm text-muted">
              <div className="rounded-[1.25rem] border border-line bg-white/6 px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Best value
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {bestValue ? bestValue.player : "Waiting on slate"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {bestValue
                    ? `${bestValue.projection.toFixed(1)} projection at $${bestValue.salary} against ${bestValue.opponent ?? "TBD"}`
                    : "Projected player values appear once the next slate is available."}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Best ceiling
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {topCeiling ? topCeiling.player : "Waiting on slate"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {topCeiling
                    ? `${topCeiling.ceiling.toFixed(1)} ceiling with ${topCeiling.shotVolume.toFixed(1)} shot volume`
                    : "The board will surface the highest-upside spots for the next card."}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Safest floor
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {safestFloor ? safestFloor.player : "Waiting on slate"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {safestFloor
                    ? `${safestFloor.floor.toFixed(1)} floor with ${formatPercent(
                        safestFloor.confidence
                      )} confidence`
                    : "Role-stable players with the safest ranges show up here."}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/6 px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Best prop spot
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {propFavorite ? propFavorite.player : "Waiting on slate"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {propFavorite
                    ? `${propFavorite.shotVolume.toFixed(1)} shots and ${propFavorite.creationVolume.toFixed(
                        1
                      )} creation volume vs ${propFavorite.opponent ?? "TBD"}`
                    : "Shot and creation leaders appear here for prop-style research."}
                </p>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Workflow"
            title="How sharper users work the board"
            description="The product is built around one consistent sequence."
            tone="accent"
          >
            <div className="grid gap-3">
              <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">1. Open matchups first</p>
                <p className="mt-1 text-sm text-muted">
                  Find the likely scripts, totals, and clean-sheet spots before selecting players.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">2. Filter the player board</p>
                <p className="mt-1 text-sm text-muted">
                  Sort by value, ceiling, floor, or prop-friendly volume depending on the decision.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">3. Check fair prices last</p>
                <p className="mt-1 text-sm text-muted">
                  Compare model probabilities with market prices only after the matchup context makes sense.
                </p>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {researchPillars.map((pillar, index) => (
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
                <Radar className="size-4" />
              ) : index === 1 ? (
                <Sparkles className="size-4" />
              ) : (
                <Target className="size-4" />
              )}
              Consumer-ready slate read
            </div>
          </SurfaceCard>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard
          eyebrow="Player board"
          title="Top targets on the next slate"
          description="These are matchup-aware projections for the upcoming fixtures, not season-long averages."
          className="section-fade"
        >
          {featuredPlayers.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {featuredPlayers.map((player) => (
                <div
                  key={player.id}
                  className="rounded-[1.35rem] border border-line bg-panel-soft px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                        {player.matchupTag}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-foreground">
                        {player.player}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {player.team} • {player.position} • vs {player.opponent ?? "TBD"}
                      </p>
                    </div>
                    <span className="rounded-full border border-brand/30 bg-brand/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-strong">
                      ${player.salary}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
                        Projection
                      </p>
                      <p className="mt-1 text-xl font-semibold text-foreground">
                        {player.projection.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
                        Ceiling
                      </p>
                      <p className="mt-1 text-xl font-semibold text-foreground">
                        {player.ceiling.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
                        Confidence
                      </p>
                      <p className="mt-1 text-xl font-semibold text-foreground">
                        {formatPercent(player.confidence)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-muted">
                    {player.reasons[0] ?? player.trendLabel}
                  </p>
                  <div className="mt-4">
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
          ) : (
            <div className="rounded-[1.35rem] border border-dashed border-line bg-white/4 px-5 py-8 text-sm text-muted">
              Player projections will appear here once the next slate is available.
            </div>
          )}
        </SurfaceCard>

        <div className="grid gap-5 section-fade section-fade-delay-1">
          <SurfaceCard
            eyebrow="Projection inputs"
            title="What actually moves a player up the board"
            description="The model leans on role, matchup, and event volume instead of one blunt season average."
          >
            <div className="grid gap-3">
              {scoringAnchors.map((anchor) => (
                <div
                  key={anchor.label}
                  className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3"
                >
                  <p className="text-sm font-semibold text-foreground">{anchor.label}</p>
                  <p className="max-w-[25rem] text-right text-sm text-muted">{anchor.value}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard
            eyebrow="Research stack"
            title="Use the full board in three tabs"
            description="The public product is organized around the exact questions you ask before lock."
          >
            <div className="grid gap-3">
              <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Matchups
                </p>
                <p className="mt-2 text-sm text-muted">
                  Win chances, totals, clean-sheet probabilities, and fair prices.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Players
                </p>
                <p className="mt-2 text-sm text-muted">
                  Projection ranges, value, prop-friendly volume, and role notes.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Research
                </p>
                <p className="mt-2 text-sm text-muted">
                  Team form, archive context, and multi-source stats when you need a deeper read.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/matchups"
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                Matchups
              </Link>
              <Link
                href="/players"
                className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground hover:border-brand-strong/40 hover:text-brand-strong"
              >
                Players
              </Link>
              <Link
                href="/analytics"
                className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground hover:border-brand-strong/40 hover:text-brand-strong"
              >
                Research
              </Link>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-bold text-white">Sharper calls before every lock</h2>
        <p className="mx-auto max-w-2xl text-white/60">
          Match forecasts, player projections, and price-sensitive signals are built for fantasy
          decisions, prop research, and matchup previews. Use them to break close calls, find value,
          and get to kickoff with a stronger read than raw box scores can give you.
        </p>
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-card rounded-xl border border-line p-4">
            <p className="text-lg font-bold text-white">Matchup Previews</p>
            <p className="text-sm text-white/50">
              See expected scorelines, win chances, and fair prices before kickoff
            </p>
          </div>
          <div className="glass-card rounded-xl border border-line p-4">
            <p className="text-lg font-bold text-white">Player Projections</p>
            <p className="text-sm text-white/50">
              Compare expected output, range, value, and role confidence
            </p>
          </div>
          <div className="glass-card rounded-xl border border-line p-4">
            <p className="text-lg font-bold text-white">Betting Angles</p>
            <p className="text-sm text-white/50">
              Find pace, clean-sheet, and shot-volume spots worth a second look
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/matchups"
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white"
          >
            Start with matchups
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/players"
            className="rounded-full border border-line bg-white/6 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
          >
            Explore player board
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
