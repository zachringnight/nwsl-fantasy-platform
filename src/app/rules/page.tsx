import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";

const gameModes = [
  "Classic season-long head-to-head leagues with a live snake draft",
  "Season-long salary-cap contests that lock once and ride for the full season",
  "Weekly salary-cap contests that reopen for every scoring cycle",
  "Daily salary-cap contests built around same-day match windows",
  "Private leagues shared through invite codes",
  "Shared player pool for salary-cap formats and exclusive ownership for classic",
];

const scoringCategories = [
  `Floor: appearance ${launchScoringRules.appearance}, 60+ minutes ${launchScoringRules.minutes60Plus}`,
  `Attack: goals ${launchScoringRules.goal.FWD}-${launchScoringRules.goal.DEF}, assists ${launchScoringRules.assist}, shots ${launchScoringRules.shot}, shots on target ${launchScoringRules.shotOnTarget}`,
  `Creation: chances created ${launchScoringRules.chanceCreated}, successful crosses ${launchScoringRules.successfulCross}, successful passes ${launchScoringRules.successfulPass}`,
  `Ball-winning: tackles won ${launchScoringRules.tackleWon}, interceptions ${launchScoringRules.interception}, blocks ${launchScoringRules.block}`,
  `Defensive events: clean sheets ${launchScoringRules.cleanSheet.DEF}-${launchScoringRules.cleanSheet.GK}, saves ${launchScoringRules.save}, goals conceded ${launchScoringRules.goalsConceded.DEF}/${launchScoringRules.goalsConceded.GK}`,
  `Risk events: fouls committed ${launchScoringRules.foulCommitted}, yellow ${launchScoringRules.yellowCard}, red ${launchScoringRules.redCard}, penalty miss ${launchScoringRules.penaltyMiss}`,
];

export default function RulesPage() {
  return (
    <AppShell
      eyebrow="Rules"
      title="The rules that shape every league and contest"
      description="Use this page to understand how each format behaves, what stats matter, and how locks, waivers, and standings work before the season gets loud."
    >
      <section className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="Formats"
          title="How you can play"
          description="Classic and salary-cap modes share the same player pool, but they handle ownership, locks, and lineup control differently."
        >
          <ul className="space-y-3 text-sm leading-6 text-muted">
            {gameModes.map((item) => (
              <li key={item} className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Scoring"
          title="What earns or loses points"
          description="The scoring model now rewards real soccer actions across finishing, creation, passing volume, ball-winning, and goalkeeper work instead of leaning almost entirely on goals and assists."
          tone="accent"
        >
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {scoringCategories.map((item) => (
              <li key={item} className="rounded-[1.2rem] bg-white/10 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
