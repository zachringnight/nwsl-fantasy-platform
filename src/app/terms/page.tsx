import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

const houseRules = [
  {
    title: "Fair play",
    description:
      "Use one account per person, avoid impersonation, and do not interfere with other leagues or managers.",
  },
  {
    title: "League integrity",
    description:
      "Commissioners can manage their leagues, but platform-wide abuse, spam, or automation that harms play may be removed.",
  },
  {
    title: "Product changes",
    description:
      "Scoring, formats, and features may evolve during the season, but we aim to keep active leagues stable and clearly informed.",
  },
];

export default function TermsPage() {
  return (
    <AppShell
      eyebrow="Terms"
      title="The rules for using the platform"
      description="Short version: be fair, respect other managers, and use the app the way a league host would expect."
      actions={
        <Link href="/rules" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Open scoring rules
        </Link>
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard
          eyebrow="Platform use"
          title="Simple, league-first expectations"
          description="These terms are meant to protect fair competition and keep the product usable during live match windows."
        >
          <div className="space-y-3 text-sm text-muted">
            {houseRules.map((rule) => (
              <div key={rule.title} className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="font-semibold text-foreground">{rule.title}</p>
                <p className="mt-2 leading-6 text-muted">{rule.description}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Practical note"
          title="Fantasy outcomes can change fast"
          description="Live sports data can shift because of stat corrections, postponed matches, or source-provider updates."
          tone="accent"
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
              <p className="font-semibold">Drafts and locks</p>
              <p className="mt-1 text-muted">Managers are responsible for meeting draft timers and lineup lock deadlines shown in the app.</p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
              <p className="font-semibold">Stat corrections</p>
              <p className="mt-1 text-muted">If an official data source revises a stat line, league scores may update to match the corrected feed.</p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
