import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { DraftBoard } from "@/components/draft/draft-board";
import { getButtonClassName } from "@/components/ui/button";
import { getFantasyPlayerPool } from "@/lib/fantasy-player-pool";

export const metadata: Metadata = {
  title: "Draft Room",
  description:
    "Preview the NWSL fantasy draft room layout before your league goes on the clock.",
};

export default function DraftRoomPage() {
  return (
    <AppShell
      eyebrow="Draft Room"
      title="Preview the draft experience"
      description="This is what draft night looks like. Create or join a league to start your draft."
      actions={
        <div className="flex gap-3">
          <Link
            href="/leagues/create"
            className={getButtonClassName()}
          >
            Create a league
          </Link>
          <Link
            href="/leagues/join"
            className={getButtonClassName({ variant: "secondary" })}
          >
            Join a league
          </Link>
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <SurfaceCard
          eyebrow="How it works"
          title="Live snake draft"
          description="When your league is ready, everyone joins the same room."
        >
          <div className="space-y-3 text-sm leading-6 text-muted">
            <p>The commissioner sets the draft date and time. When the clock starts, picks happen in snake order — if you pick first in round one, you pick last in round two.</p>
            <p>A visible timer, pick history, and your personal queue keep the room moving. If the clock runs out, your top queued player is selected automatically.</p>
            <p>After every roster is filled, you land on your team page ready to set lineups.</p>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Player board preview"
          title="Top available players"
          description="The full board is available during your draft."
          tone="accent"
        >
          <DraftBoard players={getFantasyPlayerPool().slice(0, 8)} />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
