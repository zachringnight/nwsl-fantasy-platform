import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Edge Dashboard",
};

export default async function EdgeDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const edges = await prisma.bettingEdge.findMany({
    where: {
      edge: { gt: 0 },
    },
    include: {
      prediction: {
        include: {
          fixture: {
            include: {
              homeClub: true,
              awayClub: true,
            },
          },
        },
      },
    },
    orderBy: { edge: "desc" },
    take: 50,
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-white/50">
          Admin
        </p>
        <h1 className="text-2xl font-bold text-white">Edge Dashboard</h1>
        <p className="text-sm text-white/50">
          Betting edges ranked by expected value. Positive edge indicates
          model-predicted value above market price.
        </p>
      </div>

      {edges.length === 0 ? (
        <div className="glass-card rounded-2xl border border-line bg-panel-strong p-8 text-center">
          <p className="text-white/50">
            No positive edges found. Edges are generated when model predictions
            differ from market odds.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {edges.map((edge) => {
            const fixture = edge.prediction.fixture;
            const edgePct = ((edge.edge ?? 0) * 100).toFixed(1);
            const fairOddsDisplay = edge.fairOdds.toFixed(2);
            const marketOddsDisplay = edge.marketOdds
              ? edge.marketOdds.toFixed(2)
              : "N/A";
            const kellyStake = edge.recommendedStake
              ? `${(edge.recommendedStake * 100).toFixed(1)}%`
              : "N/A";

            return (
              <div
                key={edge.id}
                className="glass-card rounded-2xl border border-line bg-panel-strong p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">
                      {fixture.homeClub.name} vs {fixture.awayClub.name}
                    </p>
                    <p className="text-xs text-white/50">
                      {edge.market} &middot;{" "}
                      {new Date(fixture.startsAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-lg font-bold text-emerald-400">
                      +{edgePct}%
                    </p>
                    <p className="text-xs text-white/40">edge</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-white/40">Fair Odds</p>
                    <p className="text-sm font-semibold text-white">
                      {fairOddsDisplay}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Market Odds</p>
                    <p className="text-sm font-semibold text-white">
                      {marketOddsDisplay}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Kelly Stake</p>
                    <p className="text-sm font-semibold text-white">
                      {kellyStake}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
