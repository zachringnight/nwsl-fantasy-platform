import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";

const gameModes = [
  "Classic season-long leagues with a live snake draft",
  "Season-long salary cap — lock once, ride all season",
  "Weekly salary-cap contests that reset each cycle",
  "Daily contests built around same-day matches",
  "Private leagues with invite codes",
  "Shared player pool (salary cap) or exclusive rosters (classic)",
];

const scoringCategories = [
  `Floor: appearance ${launchScoringRules.appearance}, 60+ minutes ${launchScoringRules.minutes60Plus}`,
  `Attack: goals ${launchScoringRules.goal.FWD}–${launchScoringRules.goal.DEF}, assists ${launchScoringRules.assist}, shots ${launchScoringRules.shot}, on target ${launchScoringRules.shotOnTarget}`,
  `Creation: chances ${launchScoringRules.chanceCreated}, crosses ${launchScoringRules.successfulCross}, passes ${launchScoringRules.successfulPass}`,
  `Ball-winning: tackles ${launchScoringRules.tackleWon}, interceptions ${launchScoringRules.interception}, blocks ${launchScoringRules.block}`,
  `Defense: clean sheets ${launchScoringRules.cleanSheet.DEF}–${launchScoringRules.cleanSheet.GK}, saves ${launchScoringRules.save}, goals conceded ${launchScoringRules.goalsConceded.DEF}/${launchScoringRules.goalsConceded.GK}`,
  `Risk: fouls ${launchScoringRules.foulCommitted}, yellow ${launchScoringRules.yellowCard}, red ${launchScoringRules.redCard}, pen miss ${launchScoringRules.penaltyMiss}`,
];

export default function RulesPage() {
  return (
    <AppShell
      eyebrow="Rules"
      title="How every league and contest works"
      description="Formats, scoring, and point values — all in one place."
    >
      <section className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="Formats"
          title="Ways to play"
          description="Classic and salary-cap modes share the same player board with different ownership rules."
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
          title="What earns and loses points"
          description="Goals matter, but so do creation, defending, and goalkeeper work."
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
