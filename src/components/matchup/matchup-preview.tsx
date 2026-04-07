import Link from "next/link";
import { ArrowUpRight, BarChart3, CalendarRange, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import type {
  MatchupPreviewRecord,
  PlayerProjectionRecord,
  PredictiveSlateBoardRecord,
} from "@/lib/analytics/predictive";

function formatPercent(probability: number) {
  return `${Math.round(probability * 100)}%`;
}

function probabilityTone(probability: number) {
  if (probability >= 0.55) return "brand";
  if (probability >= 0.38) return "accent";
  return "default";
}

function priceTone(label: string) {
  if (label.includes("win")) return "brand";
  if (label.includes("Over") || label.includes("BTTS")) return "accent";
  return "default";
}

function TargetList({
  players,
  title,
}: {
  players: PlayerProjectionRecord[];
  title: string;
}) {
  return (
    <div className="space-y-3 rounded-[1.4rem] border border-line bg-white/5 p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
        {title}
      </p>
      <div className="space-y-3">
        {players.slice(0, 3).map((player) => (
          <div
            key={`${title}-${player.id}`}
            className="rounded-[1rem] border border-line bg-white/6 px-3 py-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{player.player}</p>
                <p className="text-xs text-muted">
                  {player.position} • {player.team}
                </p>
              </div>
              <Pill tone="default">{player.projection.toFixed(1)}</Pill>
            </div>
            <p className="mt-2 text-xs leading-6 text-muted">
              {player.lineupStatus} • {Math.round(player.starterProbability * 100)}% start •{" "}
              {player.reasons[0] ??
                `${player.floor.toFixed(1)} floor • ${player.ceiling.toFixed(1)} ceiling`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatchupPreviewCard({
  detailHref,
  matchup,
}: {
  detailHref?: string;
  matchup: MatchupPreviewRecord;
}) {
  const favoriteIsHome = matchup.homeWinProb >= matchup.awayWinProb;
  const favoriteTeam = favoriteIsHome ? matchup.homeTeam : matchup.awayTeam;
  const favoriteProb = favoriteIsHome ? matchup.homeWinProb : matchup.awayWinProb;

  return (
    <SurfaceCard
      eyebrow={matchup.matchDateLabel}
      title={`${matchup.homeTeam} vs ${matchup.awayTeam}`}
      description={matchup.summary}
      tone={favoriteProb >= 0.56 ? "brand" : "default"}
      className="h-full"
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Pill tone={probabilityTone(favoriteProb)}>
              {favoriteTeam} {formatPercent(favoriteProb)}
            </Pill>
            <Pill tone="default">{matchup.tempoLabel}</Pill>
            <Pill tone="default">{matchup.volatilityLabel}</Pill>
            <Pill tone="default">{formatPercent(matchup.confidence)} model confidence</Pill>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted">
              <span>{matchup.homeTeam}</span>
              <span>Draw</span>
              <span>{matchup.awayTeam}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
              <div className="bg-brand" style={{ width: `${Math.round(matchup.homeWinProb * 100)}%` }} />
              <div className="bg-white/20" style={{ width: `${Math.round(matchup.drawProb * 100)}%` }} />
              <div className="bg-accent" style={{ width: `${Math.round(matchup.awayWinProb * 100)}%` }} />
            </div>
            <div className="flex justify-between text-sm font-semibold text-foreground">
              <span>{formatPercent(matchup.homeWinProb)}</span>
              <span>{formatPercent(matchup.drawProb)}</span>
              <span>{formatPercent(matchup.awayWinProb)}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.35rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Expected goals
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {matchup.lambdaHome.toFixed(1)} - {matchup.lambdaAway.toFixed(1)}
            </p>
            <p className="mt-2 text-sm text-muted">{matchup.totalGoals.toFixed(1)} total goals</p>
          </div>
          <div className="rounded-[1.35rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Clean sheets
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatPercent(matchup.homeCleanSheetProb)} / {formatPercent(matchup.awayCleanSheetProb)}
            </p>
            <p className="mt-2 text-sm text-muted">
              {matchup.homeTeam} / {matchup.awayTeam}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-[1.4rem] border border-line bg-white/5 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Fair prices
            </p>
            {matchup.fairPrices.slice(0, 4).map((price) => (
              <div
                key={`${matchup.matchKey}-${price.label}`}
                className="flex items-center justify-between gap-4 rounded-full border border-line bg-white/6 px-4 py-2 text-sm"
              >
                <span className="text-muted">{price.label}</span>
                <span className="font-semibold text-foreground">
                  {price.decimalOdds.toFixed(2)} / {price.americanOdds}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-[1.4rem] border border-line bg-white/5 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Most likely scores
            </p>
            <div className="flex flex-wrap gap-2">
              {matchup.topScorelines.map((scoreline) => (
                <Pill key={`${matchup.matchKey}-${scoreline.home}-${scoreline.away}`} tone="default">
                  {scoreline.home}-{scoreline.away} {formatPercent(scoreline.probability)}
                </Pill>
              ))}
            </div>
            <div className="pt-1 text-sm leading-6 text-muted">
              {matchup.angles.join(" • ")}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TargetList players={matchup.homeTargets} title={`${matchup.homeTeam} targets`} />
          <TargetList players={matchup.awayTargets} title={`${matchup.awayTeam} targets`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.4rem] border border-line bg-white/5 p-4 text-sm leading-6 text-muted">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              {matchup.homeTeam} lineup read
            </p>
            <p className="mt-3">{matchup.homeLineupSummary}</p>
          </div>
          <div className="rounded-[1.4rem] border border-line bg-white/5 p-4 text-sm leading-6 text-muted">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              {matchup.awayTeam} lineup read
            </p>
            <p className="mt-3">{matchup.awayLineupSummary}</p>
          </div>
        </div>

        {detailHref ? (
          <Link href={detailHref} className={getButtonClassName({ className: "group" })}>
            Open full preview
            <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

export function MatchupPreviewHub({
  matchupBoard,
  matchups,
}: {
  matchupBoard: PredictiveSlateBoardRecord[];
  matchups: MatchupPreviewRecord[];
}) {
  if (matchups.length === 0) {
    return (
      <AppShell
        eyebrow="Matchups"
        title="Matchup board is waiting on fixtures"
        description="As soon as the next NWSL slate lands, this page will turn into the preview board for totals, fair prices, and top targets."
      >
        <EmptyState
          title="No matchup previews yet"
          description="Load the next slate and the model will surface game environments, fair prices, and player targets here."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Matchups"
      title="NWSL matchup preview board"
      description="Use fair prices, projected totals, clean-sheet odds, and top player targets to move from raw data to actual pre-match decisions."
      actions={
        <Link href="/players" className={getButtonClassName({ variant: "secondary" })}>
          Open player board
          <ArrowUpRight className="size-4" />
        </Link>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SurfaceCard
          eyebrow="Slate view"
          title="Start with the games that matter most"
          description="The board below highlights the strongest side, best total, best clean sheet, and top player value before you dig into individual previews."
          tone="brand"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {matchupBoard.map((item) => (
              <div key={item.label} className="rounded-[1.35rem] border border-white/12 bg-black/18 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/72">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-white/72">{item.detail}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="What this page answers"
          title="Built for predictions, fantasy, and betting research"
          description="Each preview is centered on the next match, not the season archive."
        >
          <div className="space-y-3 text-sm text-muted">
            <div className="flex items-center gap-2">
              <CalendarRange className="size-4 text-brand-strong" />
              Which games project for pace and goals?
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-strong" />
              What are the fair win, draw, total, and BTTS prices?
            </div>
            <div className="flex items-center gap-2">
              <Target className="size-4 text-brand-strong" />
              Which players sit in the best environments?
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand-strong" />
              Where is the cleanest edge before line movement?
            </div>
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {matchups.map((matchup) => (
          <MatchupPreviewCard
            key={matchup.matchKey}
            detailHref={`/matchups/${matchup.slug}`}
            matchup={matchup}
          />
        ))}
      </section>
    </AppShell>
  );
}

export function MatchupPreviewDetail({ matchup }: { matchup: MatchupPreviewRecord }) {
  return (
    <AppShell
      eyebrow="Matchup preview"
      title={`${matchup.homeTeam} vs ${matchup.awayTeam}`}
      description={matchup.summary}
      actions={
        <Link href="/matchups" className={getButtonClassName({ variant: "secondary" })}>
          Back to matchups
        </Link>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <MatchupPreviewCard matchup={matchup} />

        <div className="grid gap-5">
          <SurfaceCard
            eyebrow="Model angles"
            title="Fair prices and research tags"
            description="Use these as the model number before you compare to market price."
          >
            <div className="space-y-3">
              {matchup.fairPrices.map((price) => (
                <div
                  key={`${matchup.matchKey}-detail-${price.label}`}
                  className="rounded-[1.3rem] border border-line bg-white/6 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <Pill tone={priceTone(price.label)}>{price.label}</Pill>
                    <p className="font-semibold text-foreground">
                      {price.decimalOdds.toFixed(2)} / {price.americanOdds}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {formatPercent(price.probability)} implied by the model
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Preview notes"
            title="What drives the read"
            description="The quick narrative view for lineup, prop, and price decisions."
          >
            <div className="space-y-3">
              {matchup.angles.map((angle) => (
                <div
                  key={`${matchup.matchKey}-${angle}`}
                  className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3 text-sm leading-6 text-foreground"
                >
                  {angle}
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Lineup certainty"
            title="Who looks stable before lock"
            description="Projected starter odds come from recent starts, current-season minutes, and historical role."
          >
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
                <p className="font-semibold text-foreground">{matchup.homeTeam}</p>
                <p className="mt-1 text-muted">{matchup.homeLineupSummary}</p>
              </div>
              <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
                <p className="font-semibold text-foreground">{matchup.awayTeam}</p>
                <p className="mt-1 text-muted">{matchup.awayLineupSummary}</p>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>
    </AppShell>
  );
}
