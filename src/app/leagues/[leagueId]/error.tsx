"use client";

import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

export default function LeagueErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell
      eyebrow="League error"
      title="Something went wrong"
      description="This league page ran into a problem. You can try again or head back to your leagues."
      actions={
        <div className="flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
            type="button"
          >
            Try again
          </button>
          <Link
            href="/leagues"
            className="rounded-full border border-line bg-white/6 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
          >
            Back to leagues
          </Link>
        </div>
      }
    >
      <SurfaceCard
        eyebrow="What happened"
        title="The league page ran into a problem"
        description="This might be a temporary issue. Try refreshing, or head back to your league list."
      />
    </AppShell>
  );
}
