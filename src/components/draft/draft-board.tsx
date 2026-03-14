"use client";

import { BadgeDollarSign, ListPlus, TimerReset } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import type { FantasyPoolPlayer } from "@/types/fantasy";

export interface DraftBoardProps {
  busyPlayerId?: string | null;
  canDraft?: boolean;
  highlightedPlayerId?: string | null;
  onDraft?: (playerId: string) => void;
  onQueue?: (playerId: string) => void;
  players: FantasyPoolPlayer[];
  queuedPlayerIds?: string[];
}

export function DraftBoard({
  busyPlayerId,
  canDraft = false,
  highlightedPlayerId,
  onDraft,
  onQueue,
  players,
  queuedPlayerIds = [],
}: DraftBoardProps) {
  return (
    <SurfaceCard
      eyebrow="Best available"
      title="Player pool"
      description="Queue players, then draft when the clock reaches you."
    >
      <div className="space-y-3">
        {players.map((player) => {
          const isBusy = busyPlayerId === player.id;
          const isQueued = queuedPlayerIds.includes(player.id);
          const isHighlighted = highlightedPlayerId === player.id;

          return (
            <div
              key={player.id}
              className={`rounded-[1.5rem] border px-4 py-4 transition ${
                isQueued
                  ? "border-brand-strong/40 bg-brand/12 shadow-[0_18px_48px_rgba(5,34,255,0.18)]"
                  : "border-line bg-panel-soft hover:border-brand-strong/24 hover:bg-white/7"
              } ${
                isHighlighted
                  ? "motion-safe:animate-pulse ring-1 ring-brand-strong/40 shadow-[0_0_0_1px_rgba(0,225,255,0.12),0_24px_60px_rgba(0,225,255,0.16)]"
                  : ""
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.2rem] border border-line bg-black/30 text-center">
                  <div>
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                      Rank
                    </p>
                    <p className="mt-1 text-xl font-semibold leading-none text-foreground">
                      {player.rank}
                    </p>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl uppercase leading-none tracking-[0.05em]">
                    {player.display_name}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {player.club_name} • {player.position}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/6 px-3 py-1 text-muted">
                      <TimerReset className="size-3.5 text-brand-strong" />
                      {player.average_points.toFixed(1)} avg
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/6 px-3 py-1 text-muted">
                      <BadgeDollarSign className="size-3.5 text-brand-strong" />
                      ${player.salary_cost}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/6 px-3 py-1 text-muted">
                      {player.availability}
                    </span>
                    {isQueued ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border border-brand-strong/25 bg-brand/15 px-3 py-1 text-brand-strong ${
                          isHighlighted ? "motion-safe:animate-pulse" : ""
                        }`}
                      >
                        <ListPlus className="size-3.5" />
                        Queued
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    className="min-h-10 rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-panel-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isBusy || isQueued || !onQueue}
                    onClick={() => {
                      onQueue?.(player.id);
                    }}
                    type="button"
                  >
                    {isBusy ? "Working..." : isQueued ? "Queued" : "Queue"}
                  </button>
                  <button
                    className="min-h-10 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isBusy || !canDraft || !onDraft}
                    onClick={() => {
                      onDraft?.(player.id);
                    }}
                    type="button"
                  >
                    {isBusy ? "Working..." : canDraft ? "Draft now" : "Wait turn"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
}
