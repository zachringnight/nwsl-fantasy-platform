import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";

const gameModes = [
  { label: "Classic", detail: "Season-long league with a live snake draft" },
  { label: "Season cap", detail: "Build one roster under the cap — no draft needed" },
  { label: "Weekly cap", detail: "Rebuild your lineup every matchweek" },
  { label: "Daily cap", detail: "Pick players for a single matchday" },
  { label: "Private leagues", detail: "Create or join with a short invite code" },
  { label: "Shared vs exclusive", detail: "Salary-cap shares players; classic rosters are exclusive" },
];

const scoringGroups = [
  {
    category: "Floor",
    description: "Every player earns just for showing up.",
    items: [
      { action: "Appearance", pts: launchScoringRules.appearance },
      { action: "60+ minutes", pts: launchScoringRules.minutes60Plus },
    ],
  },
  {
    category: "Attack",
    description: "Finishing and shot volume.",
    items: [
      { action: "Goal (FWD / MID)", pts: `${launchScoringRules.goal.FWD}` },
      { action: "Goal (DEF / GK)", pts: `${launchScoringRules.goal.DEF}` },
      { action: "Assist", pts: launchScoringRules.assist },
      { action: "Shot", pts: launchScoringRules.shot },
      { action: "Shot on target", pts: launchScoringRules.shotOnTarget },
    ],
  },
  {
    category: "Creation",
    description: "Building chances for teammates.",
    items: [
      { action: "Chance created", pts: launchScoringRules.chanceCreated },
      { action: "Successful cross", pts: launchScoringRules.successfulCross },
      { action: "Successful pass", pts: launchScoringRules.successfulPass },
    ],
  },
  {
    category: "Defending",
    description: "Ball-winning and shot-blocking.",
    items: [
      { action: "Tackle won", pts: launchScoringRules.tackleWon },
      { action: "Interception", pts: launchScoringRules.interception },
      { action: "Block", pts: launchScoringRules.block },
      { action: "Clean sheet (GK)", pts: launchScoringRules.cleanSheet.GK },
      { action: "Clean sheet (DEF)", pts: launchScoringRules.cleanSheet.DEF },
      { action: "Save", pts: launchScoringRules.save },
    ],
  },
  {
    category: "Risk",
    description: "Actions that cost points.",
    items: [
      { action: "Foul committed", pts: launchScoringRules.foulCommitted },
      { action: "Yellow card", pts: launchScoringRules.yellowCard },
      { action: "Red card", pts: launchScoringRules.redCard },
      { action: "Penalty miss", pts: launchScoringRules.penaltyMiss },
      { action: "Own goal", pts: launchScoringRules.ownGoal },
      { action: "Goals conceded (GK)", pts: launchScoringRules.goalsConceded.GK },
      { action: "Goals conceded (DEF)", pts: launchScoringRules.goalsConceded.DEF },
    ],
  },
  {
    category: "Bonus",
    description: "Extra rewards for goalkeepers.",
    items: [
      { action: "Penalty save", pts: launchScoringRules.penaltySave },
      { action: "GK win", pts: launchScoringRules.goalkeeperWin },
      { action: "GK draw", pts: launchScoringRules.goalkeeperDraw },
      { action: "Foul won", pts: launchScoringRules.foulWon },
    ],
  },
];

export default function RulesPage() {
  return (
    <AppShell
      eyebrow="Rules"
      title="How every league and contest works"
      description="Formats, scoring, and point values — all in one place."
    >
      <SurfaceCard
        eyebrow="Formats"
        title="Ways to play"
        description="Classic and salary-cap modes share the same player board with different ownership rules."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gameModes.map((mode) => (
            <div key={mode.label} className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{mode.label}</p>
              <p className="mt-1 text-sm text-muted">{mode.detail}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {scoringGroups.map((group) => (
          <SurfaceCard
            key={group.category}
            eyebrow={group.category}
            title={group.category}
            description={group.description}
            tone={group.category === "Risk" ? "accent" : undefined}
          >
            <div className="space-y-2">
              {group.items.map((item) => (
                <div
                  key={item.action}
                  className="flex items-center justify-between rounded-xl border border-line bg-panel-soft px-3 py-2"
                >
                  <span className="text-sm text-muted">{item.action}</span>
                  <span className={`text-sm font-semibold ${Number(item.pts) < 0 ? "text-red-400" : "text-foreground"}`}>
                    {Number(item.pts) > 0 ? `+${item.pts}` : item.pts}
                  </span>
                </div>
              ))}
            </div>
          </SurfaceCard>
        ))}
      </section>
    </AppShell>
  );
}
