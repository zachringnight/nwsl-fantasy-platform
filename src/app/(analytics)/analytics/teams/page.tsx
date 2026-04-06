import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { FormIndicator } from "@/components/analytics/form-indicator";
import { getLeagueTable } from "@/lib/analytics/analytics-data";

export const metadata = {
  title: "League Table",
  description: "NWSL standings, points, goal difference, and recent form for all 14 teams.",
};

export default function TeamsPage() {
  const standings = getLeagueTable();

  return (
    <AppShell
      eyebrow="Team Analytics"
      title="League Table"
      description="Full NWSL standings with real W/D/L records, goal difference, and recent form from ESPN."
    >
      <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white/4">
        <table className="w-full min-w-[900px] text-sm">
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
              const isTop = i < 4;
              const isBottom = i >= standings.length - 2;
              return (
                <tr
                  key={team.teamId}
                  className={`border-b border-line/50 transition hover:bg-white/4 ${
                    isTop
                      ? "border-l-2 border-l-brand-strong"
                      : isBottom
                        ? "border-l-2 border-l-danger/60"
                        : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/analytics/teams/${team.teamId}`}
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
