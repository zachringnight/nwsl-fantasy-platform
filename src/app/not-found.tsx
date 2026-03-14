import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

export default function NotFound() {
  return (
    <AppShell
      eyebrow="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
      actions={
        <Link
          href="/"
          className="inline-flex rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
        >
          Back to home
        </Link>
      }
    >
      <section className="grid gap-5 md:grid-cols-2">
        <SurfaceCard
          eyebrow="Quick links"
          title="Where to go next"
          description="Jump back into the action."
        >
          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="block rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 transition hover:border-brand-strong/40"
            >
              <p className="font-semibold text-foreground">Dashboard</p>
              <p className="mt-1 text-sm text-muted">Your leagues, lineups, and upcoming slates.</p>
            </Link>
            <Link
              href="/players"
              className="block rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 transition hover:border-brand-strong/40"
            >
              <p className="font-semibold text-foreground">Players</p>
              <p className="mt-1 text-sm text-muted">Browse the full player board.</p>
            </Link>
            <Link
              href="/help"
              className="block rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 transition hover:border-brand-strong/40"
            >
              <p className="font-semibold text-foreground">Help</p>
              <p className="mt-1 text-sm text-muted">Answers to common questions.</p>
            </Link>
          </div>
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Support"
          title="Think this is a bug?"
          description="If you followed a link and landed here, let us know so we can fix it."
          tone="accent"
        >
          <Link
            href="/contact"
            className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
          >
            Contact support
          </Link>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
