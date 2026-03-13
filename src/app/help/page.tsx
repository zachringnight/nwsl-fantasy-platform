import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

const helpTopics = [
  {
    title: "How scoring works",
    description:
      "Classic leagues use weekly head-to-head scoring. Salary-cap contests rank your entry against the field.",
  },
  {
    title: "When lineups lock",
    description:
      "Classic rosters lock by match window. Salary-cap entries stay editable until the slate lock time.",
  },
  {
    title: "How waivers run",
    description:
      "Classic leagues use rolling priority — win a claim and you move to the back of the line.",
  },
  {
    title: "Draft room on mobile",
    description:
      "The board, queue, and clock stay visible in a phone-first layout. Draft from anywhere.",
  },
];

export default function HelpPage() {
  return (
    <AppShell
      eyebrow="Help"
      title="Quick answers when you need them"
      description="Scoring, locks, waivers, and drafts — answered in seconds."
      actions={
        <Link href="/rules" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Open rules
        </Link>
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard eyebrow="FAQ" title="Most common questions" description="The answers managers ask for during setup, draft prep, and live matchdays.">
          <div className="space-y-3 text-sm text-muted">
            {helpTopics.map((topic) => (
              <div key={topic.title} className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="font-semibold text-foreground">{topic.title}</p>
                <p className="mt-2 leading-6 text-muted">{topic.description}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Built-in context"
          title="Answers are on every screen"
          description="Rules and timing show up right where you make decisions."
          tone="accent"
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
              <p className="font-semibold">League pages</p>
              <p className="mt-1 text-muted">Draft timing, roster rules, and waivers sit right next to your lineup.</p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
              <p className="font-semibold">Salary-cap entries</p>
              <p className="mt-1 text-muted">Lock time and projections stay visible while you build.</p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
              <p className="font-semibold">Player profiles</p>
              <p className="mt-1 text-muted">See why a projection is high, not just the number.</p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
