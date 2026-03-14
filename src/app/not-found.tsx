import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

export default function NotFound() {
  return (
    <AppShell
      eyebrow="Offside"
      title="That page went out of bounds"
      description="The URL you followed is no longer on the pitch. No red card — just a quick restart."
      actions={
        <Link
          href="/"
          className="inline-flex rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
        >
          Back to kickoff
        </Link>
      }
    >
      <div className="mb-8 flex items-center justify-center">
        <div className="relative flex size-40 items-center justify-center rounded-full border-2 border-dashed border-brand/30 bg-brand/8">
          <span className="font-display text-7xl font-bold tracking-tight text-brand-strong">
            404
          </span>
          <span className="absolute -bottom-2 rounded-full bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted">
            No match found
          </span>
        </div>
      </div>

      <section className="grid gap-5 md:grid-cols-2">
        <SurfaceCard
          eyebrow="Quick links"
          title="Get back in the game"
          description="Jump back into the action."
        >
          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="block rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 transition hover:border-brand-strong/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
            >
              <p className="font-semibold text-foreground">Dashboard</p>
              <p className="mt-1 text-sm text-muted">Your leagues, lineups, and upcoming slates.</p>
            </Link>
            <Link
              href="/players"
              className="block rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 transition hover:border-brand-strong/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
            >
              <p className="font-semibold text-foreground">Players</p>
              <p className="mt-1 text-sm text-muted">Browse the full player board.</p>
            </Link>
            <Link
              href="/leagues"
              className="block rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 transition hover:border-brand-strong/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
            >
              <p className="font-semibold text-foreground">Leagues</p>
              <p className="mt-1 text-sm text-muted">Create or join a league.</p>
            </Link>
            <Link
              href="/help"
              className="block rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3 transition hover:border-brand-strong/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
            >
              <p className="font-semibold text-foreground">Help center</p>
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
          <div className="space-y-4">
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-6 text-muted">
              <p className="font-semibold text-foreground">What usually happens</p>
              <p className="mt-2">
                Old bookmarks, typos, or shared links to pages that have moved. Try the links on the left — your leagues and lineup are still safe.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
            >
              Contact support
            </Link>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
