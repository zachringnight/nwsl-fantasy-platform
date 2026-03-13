import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { DraftBoard } from "@/components/draft/draft-board";
import { DraftQueuePanel } from "@/components/draft/draft-queue-panel";
import { getFantasyPlayerPool } from "@/lib/fantasy-player-pool";

export default function DraftRoomPage() {
  return (
    <AppShell
      eyebrow="Draft Room"
      title="Draft room layout"
      description="Clock, player board, and your queue — everything you need on draft night."
    >

      <section className="grid gap-5 xl:grid-cols-[0.78fr_1.2fr_0.82fr]">
        <SurfaceCard
          eyebrow="On the clock"
          title="Pick 18"
          description="Founders Cup • Round 2 • 00:38 remaining"
          tone="brand"
        >
          <div className="space-y-4 text-sm text-white/84">
            <p>Everyone can follow the clock, the board, and the queue from the same screen.</p>
            <p>The order, timer, and recent picks stay visible so you never lose the room.</p>
            <p>The live draft uses this same layout when your league is on the clock.</p>
          </div>
        </SurfaceCard>

        <DraftBoard players={getFantasyPlayerPool().slice(0, 8)} />
        <DraftQueuePanel queue={[]} roster={[]} />
      </section>
    </AppShell>
  );
}
