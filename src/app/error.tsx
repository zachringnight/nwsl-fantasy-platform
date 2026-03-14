"use client";

import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell
      eyebrow="Error"
      title="Something went wrong"
      description="An unexpected error occurred. You can try again or head back to the home page."
      actions={
        <div className="flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
            type="button"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border border-line bg-white/6 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
          >
            Back to home
          </a>
        </div>
      }
    >
      <SurfaceCard
        eyebrow="What happened"
        title="The page ran into a problem"
        description="This might be a temporary issue. If it keeps happening, contact support."
      >
        <a
          href="/contact"
          className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
        >
          Contact support
        </a>
      </SurfaceCard>
    </AppShell>
  );
}
