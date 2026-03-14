"use client";

import { ListOrdered, ShieldCheck, Swords } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import type {
  FantasyDraftQueueItemRecord,
  FantasyRosterPlayer,
} from "@/types/fantasy";

export interface DraftQueuePanelProps {
  busyPlayerId?: string | null;
  highlightedPlayerId?: string | null;
  onMoveDown?: (playerId: string) => void;
  onMoveUp?: (playerId: string) => void;
  onRemove?: (playerId: string) => void;
  queue: FantasyDraftQueueItemRecord[];
  roster?: FantasyRosterPlayer[];
}

export function DraftQueuePanel({
  busyPlayerId,
  highlightedPlayerId,
  onMoveDown,
  onMoveUp,
  onRemove,
  queue,
  roster = [],
}: DraftQueuePanelProps) {
  return (
    <div className="space-y-5">
      <SurfaceCard
        eyebrow="My board"
        title="Queue"
        description="Players you want to draft, in order of preference."
        tone="accent"
      >
        <div className="space-y-3 text-sm text-foreground">
          {queue.length === 0 ? (
            <p className="rounded-[1.2rem] border border-dashed border-line bg-white/8 px-4 py-3 text-muted">
              Add players from the board to set your autopick order.
            </p>
          ) : (
            queue.map((player, index) => {
              const isBusy = busyPlayerId === player.player_id;
              const isHighlighted = highlightedPlayerId === player.player_id;

              return (
                <div
                  key={player.id}
                  className={`rounded-[1.3rem] border border-line bg-white/8 px-4 py-4 ${
                    isHighlighted
                      ? "motion-safe:animate-pulse ring-1 ring-brand-strong/40 shadow-[0_0_0_1px_rgba(0,225,255,0.12),0_24px_60px_rgba(0,225,255,0.14)]"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-full border border-brand-strong/25 bg-brand/15 text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong ${
                          isHighlighted ? "motion-safe:animate-pulse" : ""
                        }`}
                      >
                        Q{index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{player.player_name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                          {player.player_position} • {player.club_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-full border border-line bg-white/10 px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-50"
                        disabled={isBusy || index === 0 || !onMoveUp}
                        onClick={() => {
                          onMoveUp?.(player.player_id);
                        }}
                        type="button"
                      >
                        Up
                      </button>
                      <button
                        className="rounded-full border border-line bg-white/10 px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-50"
                        disabled={isBusy || index === queue.length - 1 || !onMoveDown}
                        onClick={() => {
                          onMoveDown?.(player.player_id);
                        }}
                        type="button"
                      >
                        Down
                      </button>
                      <button
                        className="rounded-full border border-danger/20 bg-danger/10 px-3 py-1 text-xs font-semibold text-danger disabled:opacity-50"
                        disabled={isBusy || !onRemove}
                        onClick={() => {
                          onRemove?.(player.player_id);
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard
        eyebrow="My roster"
        title={`${roster.length}/12 drafted`}
        description="The roster panel keeps positional balance visible while the room is live."
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-3">
              <p className="inline-flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <ShieldCheck className="size-3.5" />
                Goalkeepers
              </p>
              <p className="mt-2 text-2xl font-semibold leading-none text-foreground">
                {roster.filter((player) => player.player_position === "GK").length}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-3">
              <p className="inline-flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <Swords className="size-3.5" />
                Outfield
              </p>
              <p className="mt-2 text-2xl font-semibold leading-none text-foreground">
                {roster.filter((player) => player.player_position !== "GK").length}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-3">
              <p className="inline-flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                <ListOrdered className="size-3.5" />
                Queue depth
              </p>
              <p className="mt-2 text-2xl font-semibold leading-none text-foreground">
                {queue.length}
              </p>
            </div>
          </div>
          {roster.length === 0 ? (
            <p className="rounded-[1.2rem] border border-dashed border-line bg-white/6 px-4 py-3 text-sm text-muted">
              Your drafted players will appear here as the room fills out.
            </p>
          ) : (
            roster.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-[1.15rem] border border-line bg-white/6 px-4 py-3 text-sm"
              >
                <span className="font-medium">{player.player_name}</span>
                <span className="text-xs uppercase tracking-[0.18em] text-muted">
                  {player.player_position} • {player.club_name}
                </span>
              </div>
            ))
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
