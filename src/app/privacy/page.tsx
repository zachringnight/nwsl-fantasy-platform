import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { siteConfig } from "@/config/site";

const privacyCommitments = [
  {
    title: "Account data",
    description:
      "We keep the basics needed to run your league account, including your display name, login details, and league membership history.",
  },
  {
    title: "League activity",
    description:
      "Draft picks, roster moves, standings, and matchup results stay attached to your account so league history remains accurate.",
  },
  {
    title: "Product updates",
    description:
      "If you opt in, we may email you about league reminders, product improvements, or important service notices.",
  },
];

export default function PrivacyPage() {
  return (
    <AppShell
      eyebrow="Privacy"
      title="A clear view of what we store"
      description="The practical version: enough data to run your leagues, not a maze of legalese."
      actions={
        <Link href="/contact" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Ask a question
        </Link>
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard
          eyebrow="What we collect"
          title="Only what the game needs"
          description="Core account, league, and gameplay information keeps drafts, standings, and notifications working as expected."
        >
          <div className="space-y-3 text-sm text-muted">
            {privacyCommitments.map((commitment) => (
              <div key={commitment.title} className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
                <p className="font-semibold text-foreground">{commitment.title}</p>
                <p className="mt-2 leading-6 text-muted">{commitment.description}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Questions"
          title="Need something removed or clarified?"
          description="Reach the support inbox and we will help you sort out account or data questions."
          tone="accent"
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
              <p className="font-semibold">Support inbox</p>
              <a className="mt-1 block text-muted underline underline-offset-4" href={`mailto:${siteConfig.supportEmail}`}>
                {siteConfig.supportEmail}
              </a>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
              <p className="font-semibold">Policy updates</p>
              <p className="mt-1 text-muted">
                We will update this page when product behavior changes in a way that materially affects account data.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
