import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { FormIndicator } from "@/components/analytics/form-indicator";
import { getLeagueTableBySeason, type Season } from "@/lib/analytics/analytics-data";
import { getLiveNwslPublicData } from "@/lib/analytics/live-nwsl-public-data";
import { analyticsTeamHref } from "@/lib/analytics/entity-routes";

export const metadata = {
  title: "League Table",
  description: "NWSL standings, points, goal difference, and recent form for all teams.",
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const season: Season = params.season === "2025" ? "2025" : "2026";
  const live = season === "2026" ? await getLiveNwslPublicData() : null;
  const standings = live?.standings ?? getLeagueTableBySeason(season);
  const source =
    live?.provenance.source ?? (season === "2026" ? "ESPN" : "ESPN archive");

  return (
    <AppShell
      eyebrow="Team Analytics"
      title="League Table"
      description={`${season} NWSL standings with W/D/L records, goal difference, and recent form from ${source}.`}
    >
      {live?.provenance.isStale && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          The last complete official snapshot is older than 36 hours. It remains
          visible while the next automated refresh retries.
        </div>
      )}
      <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white/4">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
              <th className="px-4 py-3 w-10">#</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 text-center">P</th>
              <th className="px-4 py-3 text-center">W</th>
              <th className="px-4 py-3 text-center">D</th>
              <th className="px-4 py-3 text-center">L</th>
              <th className="px-4 py-3 text-right">GF</th>
              <th className="px-4 py-3 text-right">GA</th>
              <th className="px-4 py-3 text-right">GD</th>
              <th className="px-4 py-3 text-right">Pts</th>
              <th className="px-4 py-3 text-center">Form</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, i) => {
              const isPlayoff = i < 8;
              return (
                <tr
                  key={team.teamId}
                  className={`border-b border-line/50 transition hover:bg-white/4 ${
                    isPlayoff
                      ? "border-l-2 border-l-brand-strong"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={analyticsTeamHref(team.teamId, season)}
                      className="font-medium text-foreground hover:text-brand-strong"
                    >
                      {team.team}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center font-mono">{team.played}</td>
                  <td className="px-4 py-3 text-center font-mono">{team.won}</td>
                  <td className="px-4 py-3 text-center font-mono">{team.drawn}</td>
                  <td className="px-4 py-3 text-center font-mono">{team.lost}</td>
                  <td className="px-4 py-3 text-right font-mono">{team.goalsFor}</td>
                  <td className="px-4 py-3 text-right font-mono">{team.goalsAgainst}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    <span className={team.goalDifference >= 0 ? "text-brand-lime" : "text-danger"}>
                      {team.goalDifference > 0 ? "+" : ""}
                      {team.goalDifference}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-lg font-semibold text-brand-strong">
                    {team.points}
                  </td>
                  <td className="px-4 py-3">
                    <FormIndicator form={team.form} className="justify-center" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
