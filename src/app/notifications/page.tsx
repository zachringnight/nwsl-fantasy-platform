import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { Pill } from "@/components/ui/pill";

const notificationMoments = [
  "Your draft turn is on deck",
  "A salary-cap entry is 15 minutes from lock",
  "A waiver claim was won, lost, or canceled",
  "A matchup went final",
];

export default function NotificationsPage() {
  return (
    <AppShell
      eyebrow="Notifications"
      title="The alerts that matter, without the noise"
      description="Use notifications for deadlines, draft turns, waiver results, and final scores so you never miss a decision window."
    >
      <section className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="Delivered in app"
          title="Alerts show up where you already play"
          description="Important league moments stay easy to spot inside the app, with the most urgent items rising to the top."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Pill tone="brand">Draft turns</Pill>
              <Pill>Lineup locks</Pill>
              <Pill>Waivers</Pill>
              <Pill>Final scores</Pill>
            </div>
            <p className="text-sm leading-6 text-muted">
              Alerts appear in the app so you can move straight from the notification into the next action.
            </p>
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="What you will see"
          title="Every alert answers the same question"
          description="What happened, how urgent it is, and where to go next."
          tone="accent"
        >
          <div className="space-y-3">
            {notificationMoments.map((moment) => (
              <div
                key={moment}
                className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 text-sm text-foreground"
              >
                {moment}
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
