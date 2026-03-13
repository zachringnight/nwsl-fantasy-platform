import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

const helpTopics = [
  {
    title: "How scoring works",
    description:
      "Classic leagues use weekly head-to-head scoring. Salary-cap contests track your single entry against the shared field for that slate.",
  },
  {
    title: "When lineups lock",
    description:
      "Classic rosters lock by match window. Salary-cap entries stay editable until the slate lock, then freeze until the next contest opens.",
  },
  {
    title: "How waivers run",
    description:
      "Classic leagues use rolling priority. If you win a claim, you move to the back of the line. Salary-cap formats do not use exclusive waivers.",
  },
  {
    title: "What the draft room does on mobile",
    description:
      "The board, queue, and clock stay visible in a phone-first layout so managers can draft from the couch, a bar, or the concourse.",
  },
];

export default function HelpPage() {
  return (
    <AppShell
      eyebrow="Help"
      title="Quick answers for the moments that decide a matchweek"
      description="Find quick answers about scoring, lineup locks, waivers, drafts, and salary-cap lineups."
      actions={
        <Link href="/rules" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Open rules
        </Link>
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard eyebrow="FAQ" title="Most common questions" description="These are the answers managers look for most often during setup, draft prep, and live matchdays.">
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
          eyebrow="Need help now?"
          title="The answer is already near the action"
          description="Most rules and timing questions are answered on the screen where the decision happens."
          tone="accent"
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <p>League pages show draft timing, roster control, and waiver rules right next to the standings and lineup tabs.</p>
            <p>Salary-cap entry screens keep slate lock, projection, and submission status visible while you build.</p>
            <p>Player pages and compare views explain why a projection is high, not just what the number is.</p>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
