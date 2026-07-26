import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { LiveMatchRefresh } from "@/components/analytics/live-match-refresh";
import { LocalKickoffTime } from "@/components/analytics/local-kickoff-time";
import { MatchStory } from "@/components/analytics/match-story";
import { Pill } from "@/components/ui/pill";
import {
  getLeagueTableBySeason,
  getMatchDetail,
  getMatchPrediction,
  getMatchResults,
  getTeamRatings,
  type Season,
} from "@/lib/analytics/analytics-data";
import { getEspnLiveMatch } from "@/lib/analytics/espn-live-match";
import {
  buildMatchStateNarrative,
  buildPrematchNarrative,
  getHeadToHead,
  getRecentTeamForm,
  type RankedStanding,
} from "@/lib/analytics/match-context";
import { analyticsTeamHref } from "@/lib/analytics/entity-routes";

export const dynamic = "force-dynamic";

function rankedStanding(
  standings: ReturnType<typeof getLeagueTableBySeason>,
  teamId: string
): RankedStanding | undefined {
  const index = standings.findIndex((standing) => standing.teamId === teamId);
  return index === -1
    ? undefined
    : {
        rank: index + 1,
        standing: standings[index],
      };
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const match = getMatchDetail(matchId);

  if (!match) {
    return (
      <AppShell
        eyebrow="Match Analytics"
        title="Not Found"
        description="Match not found."
      >
        <Link
          href="/analytics/matches"
          className="text-sm text-brand-strong hover:underline"
        >
          Back to matches
        </Link>
      </AppShell>
    );
  }

  const snapshot = await getEspnLiveMatch(matchId);
  const phase =
    snapshot?.phase ??
    (match.status === "completed"
      ? "final"
      : match.status === "live"
        ? "live"
        : "prematch");
  const homeScore = snapshot?.homeScore ?? match.homeGoals;
  const awayScore = snapshot?.awayScore ?? match.awayGoals;
  const prediction = getMatchPrediction(matchId);
  const allMatches = getMatchResults();
  const season: Season = match.date.startsWith("2025") ? "2025" : "2026";
  const standings = getLeagueTableBySeason(season);
  const ratings = getTeamRatings();
  const homeStanding = rankedStanding(standings, match.homeTeamId);
  const awayStanding = rankedStanding(standings, match.awayTeamId);
  const homeForm = getRecentTeamForm(
    allMatches,
    match.homeTeamId,
    match.date,
    match.matchId
  );
  const awayForm = getRecentTeamForm(
    allMatches,
    match.awayTeamId,
    match.date,
    match.matchId
  );
  const headToHead = getHeadToHead(
    allMatches,
    match.homeTeamId,
    match.awayTeamId,
    match.date,
    match.matchId
  );
  const narrative =
    phase === "prematch"
      ? buildPrematchNarrative({
          match,
          prediction,
          homeStanding,
          awayStanding,
          homeForm,
          awayForm,
          homeRating: ratings.find(
            (rating) => rating.teamId === match.homeTeamId
          ),
          awayRating: ratings.find(
            (rating) => rating.teamId === match.awayTeamId
          ),
        })
      : buildMatchStateNarrative({
          phase,
          statusLabel: snapshot?.statusLabel ?? "Full time",
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore,
          awayScore,
          stats: snapshot?.stats ?? null,
          events: snapshot?.events ?? [],
        });

  return (
    <AppShell
      eyebrow={`Matchday ${match.matchday} · ${match.date}`}
      title={
        <>
          <Link
            href={analyticsTeamHref(match.homeTeamId)}
            className="hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.homeTeam}
          </Link>{" "}
          vs{" "}
          <Link
            href={analyticsTeamHref(match.awayTeamId)}
            className="hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.awayTeam}
          </Link>
        </>
      }
      description={snapshot?.venue || match.venue}
      actions={
        <Link
          href="/analytics/matches"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white/6 px-4 py-2 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All Matches
        </Link>
      }
    >
      <section className="flex items-center justify-center gap-6 py-4 sm:gap-10">
        <div className="min-w-0 flex-1 text-right">
          <Link
            href={analyticsTeamHref(match.homeTeamId)}
            className="text-lg font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.homeTeam}
          </Link>
          {phase !== "prematch" ? (
            <p className="font-display text-7xl leading-none text-foreground">
              {homeScore}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-center">
          <Pill
            tone={
              phase === "live"
                ? "accent"
                : phase === "prematch"
                  ? "brand"
                  : "default"
            }
          >
            {phase === "live" ? "LIVE" : phase === "final" ? "FT" : "VS"}
          </Pill>
          {phase === "live" && snapshot?.statusLabel ? (
            <p className="mt-2 max-w-28 text-xs text-muted">
              {snapshot.statusLabel}
            </p>
          ) : phase === "prematch" ? (
            <p className="mt-2 max-w-36 text-xs leading-5 text-muted">
              <LocalKickoffTime
                value={snapshot?.kickoff ?? null}
                fallback={match.date}
              />
            </p>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <Link
            href={analyticsTeamHref(match.awayTeamId)}
            className="text-lg font-medium text-foreground transition hover:text-brand-strong hover:underline hover:underline-offset-4"
          >
            {match.awayTeam}
          </Link>
          {phase !== "prematch" ? (
            <p className="font-display text-7xl leading-none text-foreground">
              {awayScore}
            </p>
          ) : null}
        </div>
      </section>

      <LiveMatchRefresh active={phase === "live"} />

      <MatchStory
        match={match}
        phase={phase}
        snapshot={snapshot}
        prediction={prediction}
        narrative={narrative}
        homeStanding={homeStanding}
        awayStanding={awayStanding}
        homeForm={homeForm}
        awayForm={awayForm}
        headToHead={headToHead}
      />
    </AppShell>
  );
}
