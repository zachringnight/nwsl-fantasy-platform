import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { siteConfig } from "@/config/site";

const contactReasons = [
  "League setup help",
  "Account access issues",
  "Bug reports and broken pages",
  "Feature requests for future releases",
];

export default function ContactPage() {
  return (
    <AppShell
      eyebrow="Contact"
      title="Reach support without hunting for it"
      description="Use the help hub for quick answers or contact the team when you hit something broken."
      actions={
        <Link href="/help" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Open help center
        </Link>
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SurfaceCard
          eyebrow="Support"
          title="Best way to reach us"
          description="Email is the fastest path for account, league, or product issues."
        >
          <div className="space-y-3 text-sm text-muted">
            <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <p className="font-semibold text-foreground">Email support</p>
              <a className="mt-2 block text-brand-strong underline underline-offset-4" href={`mailto:${siteConfig.supportEmail}`}>
                {siteConfig.supportEmail}
              </a>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3">
              <p className="font-semibold text-foreground">Include these details</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>What you were trying to do</li>
                <li>Which league or page was affected</li>
                <li>Any screenshot or error text you saw</li>
              </ul>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Common reasons"
          title="When to contact the team"
          description="If it blocks a draft, lineup move, or account flow, send it in."
          tone="accent"
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            {contactReasons.map((reason) => (
              <div key={reason} className="rounded-[1.2rem] border border-line bg-white/6 px-4 py-3">
                {reason}
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
