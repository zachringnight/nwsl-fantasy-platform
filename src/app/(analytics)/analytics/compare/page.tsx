"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/common/app-shell";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { FormIndicator } from "@/components/analytics/form-indicator";
import { StatComparisonBar } from "@/components/analytics/stat-comparison-bar";
import { ThemedRadarChart } from "@/components/analytics/charts/themed-radar-chart";
import {
  getLeagueTable,
  getTeamStats,
  getMatchResults,
  getTeamRatings,
} from "@/lib/analytics/analytics-data";

export default function ComparePage() {
  const standings = useMemo(() => getLeagueTable(), []);
  const allStats = useMemo(() => getTeamStats(), []);
  const matches = useMemo(() => getMatchResults(), []);
  const ratings = useMemo(() => getTeamRatings(), []);

  const [teamAId, setTeamAId] = useState(standings[0]?.teamId ?? "");
  const [teamBId, setTeamBId] = useState(standings[1]?.teamId ?? "");

  const teamA = standings.find((s) => s.teamId === teamAId);
  const teamB = standings.find((s) => s.teamId === teamBId);
  const statsA = allStats.find((s) => s.teamId === teamAId);
  const statsB = allStats.find((s) => s.teamId === teamBId);
  const ratingA = ratings.find((r) => r.teamId === teamAId);
  const ratingB = ratings.find((r) => r.teamId === teamBId);

  // Head-to-head matches
  const h2hMatches = useMemo(() => {
    if (!teamAId || !teamBId) return [];
    return matches
      .filter(
        (m) =>
          m.status === "completed" &&
          ((m.homeTeamId === teamAId && m.awayTeamId === teamBId) ||
            (m.homeTeamId === teamBId && m.awayTeamId === teamAId))
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [matches, teamAId, teamBId]);

  // H2H record
  const h2hRecord = useMemo(() => {
    let aWins = 0;
    let draws = 0;
    let bWins = 0;
    let aGoals = 0;
    let bGoals = 0;
    for (const m of h2hMatches) {
      const aIsHome = m.homeTeamId === teamAId;
      const gA = aIsHome ? m.homeGoals : m.awayGoals;
      const gB = aIsHome ? m.awayGoals : m.homeGoals;
      aGoals += gA;
      bGoals += gB;
      if (gA > gB) aWins++;
      else if (gA < gB) bWins++;
      else draws++;
    }
    return { aWins, draws, bWins, aGoals, bGoals, total: h2hMatches.length };
  }, [h2hMatches, teamAId]);

  // Radar comparison data
  const radarData = useMemo(() => {
    if (!teamA || !teamB) return [];
    const maxPlayed = Math.max(teamA.played, teamB.played, 1);
    return [
      {
        subject: "Points/Game",
        A: (teamA.points / Math.max(teamA.played, 1)) * 33,
        B: (teamB.points / Math.max(teamB.played, 1)) * 33,
      },
      {
        subject: "Attack",
        A: (teamA.goalsFor / Math.max(teamA.played, 1)) * 40,
        B: (teamB.goalsFor / Math.max(teamB.played, 1)) * 40,
      },
      {
        subject: "Defense",
        A: Math.max(0, 90 - (teamA.goalsAgainst / Math.max(teamA.played, 1)) * 30),
        B: Math.max(0, 90 - (teamB.goalsAgainst / Math.max(teamB.played, 1)) * 30),
      },
      {
        subject: "Shots",
        A: Math.min(100, ((statsA?.shots ?? 0) / (maxPlayed * 15)) * 100),
        B: Math.min(100, ((statsB?.shots ?? 0) / (maxPlayed * 15)) * 100),
      },
      {
        subject: "Accuracy",
        A: statsA && statsA.shots > 0 ? (statsA.shotsOnTarget / statsA.shots) * 100 : 0,
        B: statsB && statsB.shots > 0 ? (statsB.shotsOnTarget / statsB.shots) * 100 : 0,
      },
      {
        subject: "Tackles",
        A: Math.min(100, ((statsA?.tackles ?? 0) / (maxPlayed * 15)) * 100),
        B: Math.min(100, ((statsB?.tackles ?? 0) / (maxPlayed * 15)) * 100),
      },
    ];
  }, [teamA, teamB, statsA, statsB]);

  return (
    <AppShell
      eyebrow="Team Analytics"
      title="Head-to-Head"
      description="Compare two NWSL teams side by side — standings, stats, and head-to-head record."
    >
      {/* Team Selectors */}
      <div className="grid grid-cols-2 gap-4">
        <select
          value={teamAId}
          onChange={(e) => setTeamAId(e.target.value)}
          className="rounded-xl border border-line bg-white/6 px-4 py-3 text-sm font-medium text-foreground outline-none focus:border-brand/40"
        >
          {standings.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.team}
            </option>
          ))}
        </select>
        <select
          value={teamBId}
          onChange={(e) => setTeamBId(e.target.value)}
          className="rounded-xl border border-line bg-white/6 px-4 py-3 text-sm font-medium text-foreground outline-none focus:border-brand/40"
        >
          {standings.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.team}
            </option>
          ))}
        </select>
      </div>

      {teamA && teamB && (
        <>
          {/* Standings Comparison */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-3 text-center">
              <h3 className="text-lg font-semibold text-brand-strong">{teamA.team}</h3>
              <div className="grid grid-cols-2 gap-2">
                <MetricTile label="Pts" value={teamA.points} tone="brand" />
                <MetricTile label="GD" value={`${teamA.goalDifference >= 0 ? "+" : ""}${teamA.goalDifference}`} />
              </div>
              <FormIndicator form={teamA.form} className="justify-center" />
            </div>

            <div className="flex flex-col items-center justify-center">
              <span className="text-xs uppercase tracking-widest text-muted">vs</span>
              {h2hRecord.total > 0 && (
                <div className="mt-2 space-y-1 text-center">
                  <div className="font-mono text-2xl font-bold text-foreground">
                    {h2hRecord.aWins}-{h2hRecord.draws}-{h2hRecord.bWins}
                  </div>
                  <p className="text-xs text-muted">{h2hRecord.total} meetings</p>
                </div>
              )}
            </div>

            <div className="space-y-3 text-center">
              <h3 className="text-lg font-semibold text-accent">{teamB.team}</h3>
              <div className="grid grid-cols-2 gap-2">
                <MetricTile label="Pts" value={teamB.points} tone="accent" />
                <MetricTile label="GD" value={`${teamB.goalDifference >= 0 ? "+" : ""}${teamB.goalDifference}`} />
              </div>
              <FormIndicator form={teamB.form} className="justify-center" />
            </div>
          </section>

          {/* Stat Comparison Bars */}
          <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Season Stats
            </h3>
            <div className="space-y-4">
              <StatComparisonBar label="Points" homeValue={teamA.points} awayValue={teamB.points} />
              <StatComparisonBar label="Won" homeValue={teamA.won} awayValue={teamB.won} />
              <StatComparisonBar label="Goals For" homeValue={teamA.goalsFor} awayValue={teamB.goalsFor} />
              <StatComparisonBar label="Goals Against" homeValue={teamA.goalsAgainst} awayValue={teamB.goalsAgainst} />
              {statsA && statsB && (
                <>
                  <StatComparisonBar label="Shots" homeValue={statsA.shots} awayValue={statsB.shots} />
                  <StatComparisonBar label="On Target" homeValue={statsA.shotsOnTarget} awayValue={statsB.shotsOnTarget} />
                  <StatComparisonBar label="Tackles" homeValue={statsA.tackles} awayValue={statsB.tackles} />
                  <StatComparisonBar label="Interceptions" homeValue={statsA.interceptions} awayValue={statsB.interceptions} />
                </>
              )}
            </div>
          </section>

          {/* Radar Comparison */}
          {radarData.length > 0 && (
            <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
                Profile Comparison
              </h3>
              <ThemedRadarChart
                data={radarData}
                radars={[
                  { dataKey: "A", label: teamA.team, color: "#00e1ff" },
                  { dataKey: "B", label: teamB.team, color: "#ff3c22" },
                ]}
              />
            </section>
          )}

          {/* Model Ratings */}
          {ratingA && ratingB && (
            <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
                Model Ratings
              </h3>
              <div className="space-y-4">
                <StatComparisonBar
                  label="Overall"
                  homeValue={ratingA.overallRating}
                  awayValue={ratingB.overallRating}
                  format={(v) => v.toFixed(1)}
                />
                <StatComparisonBar
                  label="Attack"
                  homeValue={ratingA.attackRating}
                  awayValue={ratingB.attackRating}
                  format={(v) => v.toFixed(1)}
                />
                <StatComparisonBar
                  label="Defense"
                  homeValue={ratingA.defenseRating}
                  awayValue={ratingB.defenseRating}
                  format={(v) => v.toFixed(1)}
                />
              </div>
            </section>
          )}

          {/* H2H Match History */}
          <section>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Head-to-Head Results
            </h3>
            {h2hMatches.length > 0 ? (
              <div className="space-y-2">
                {h2hMatches.map((m) => {
                  const aIsHome = m.homeTeamId === teamAId;
                  const aGoals = aIsHome ? m.homeGoals : m.awayGoals;
                  const bGoals = aIsHome ? m.awayGoals : m.homeGoals;
                  const result =
                    aGoals > bGoals ? "A" : aGoals < bGoals ? "B" : "D";

                  return (
                    <div
                      key={m.matchId}
                      className="flex items-center justify-between rounded-xl border border-line bg-white/4 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Pill
                          tone={
                            result === "A"
                              ? "brand"
                              : result === "B"
                                ? "accent"
                                : "default"
                          }
                        >
                          {result === "D" ? "Draw" : result === "A" ? teamA.team.split(" ").pop() : teamB.team.split(" ").pop()}
                        </Pill>
                        <span className="text-xs text-muted">{m.date}</span>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="hidden text-sm text-foreground sm:inline">
                          {m.homeTeam}
                        </span>
                        <span className="font-mono text-lg font-semibold text-foreground">
                          {m.homeGoals} - {m.awayGoals}
                        </span>
                        <span className="hidden text-sm text-foreground sm:inline">
                          {m.awayTeam}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-white/4 p-6 text-center">
                <p className="text-sm text-muted">
                  No head-to-head matches found between these teams in the dataset.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
