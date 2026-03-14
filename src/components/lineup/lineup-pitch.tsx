import {
  allLineupSlots,
  benchLineupSlots,
  lineupSlotLabels,
  starterLineupSlots,
} from "@/lib/fantasy-draft";
import { SurfaceCard } from "@/components/common/surface-card";
import type { FantasyRosterPlayer } from "@/types/fantasy";

const formationRows = [
  ["FWD_1", "FWD_2"],
  ["MID_1", "MID_2", "MID_3"],
  ["DEF_1", "FLEX", "DEF_2"],
  ["GK"],
] as const;

export interface LineupPitchProps {
  roster?: FantasyRosterPlayer[];
  title?: string;
}

function buildLineupLookup(roster: FantasyRosterPlayer[]) {
  return allLineupSlots.reduce<Record<string, FantasyRosterPlayer | null>>((accumulator, slot) => {
    accumulator[slot] = roster.find((player) => player.lineup_slot === slot) ?? null;
    return accumulator;
  }, {});
}

export function LineupPitch({
  roster = [],
  title = "Weekly lineup",
}: LineupPitchProps) {
  const lineupLookup = buildLineupLookup(roster);
  const starterCount = starterLineupSlots.filter((slot) => lineupLookup[slot]).length;
  const benchCount = benchLineupSlots.filter((slot) => lineupLookup[slot]).length;
  const positionCounts = starterLineupSlots.reduce<Record<string, number>>(
    (accumulator, slot) => {
      const player = lineupLookup[slot];

      if (player) {
        accumulator[player.player_position] += 1;
      }

      return accumulator;
    },
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );

  return (
    <SurfaceCard
      eyebrow="Lineup editor"
      title={title}
      description="Tap a slot to assign or swap players into your formation."
    >
      <div
        className="relative overflow-hidden rounded-[1.75rem] border border-line bg-[linear-gradient(180deg,rgba(5,14,34,0.98)_0%,rgba(6,20,43,0.96)_100%)] p-4 sm:p-5"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(255,255,255,0.05) 0 18%, transparent 18.5%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(180deg, rgba(5,14,34,0.98) 0%, rgba(6,20,43,0.96) 100%)",
          backgroundSize: "100% 100%, 100% 25%, 25% 100%, 100% 100%",
        }}
      >
        <div className="relative z-10 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.2rem] border border-white/10 bg-black/18 p-3">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                Starter shape
              </p>
              <p className="mt-2 text-2xl font-semibold leading-none text-white">
                {positionCounts.DEF}-{positionCounts.MID}-{positionCounts.FWD}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-black/18 p-3">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                Starters ready
              </p>
              <p className="mt-2 text-2xl font-semibold leading-none text-white">
                {starterCount}/{starterLineupSlots.length}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-black/18 p-3">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                Bench depth
              </p>
              <p className="mt-2 text-2xl font-semibold leading-none text-white">
                {benchCount}/{benchLineupSlots.length}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {formationRows.map((row, rowIndex) => (
              <div
                key={row.join("-")}
                className={`grid gap-3 ${row.length === 1 ? "mx-auto max-w-[12rem]" : row.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
              >
                {row.map((slot) => {
                  const player = lineupLookup[slot];

                  return (
                    <div
                      key={slot}
                      className={`rounded-[1.2rem] border px-4 py-4 ${
                        player
                          ? "border-brand-strong/22 bg-[rgba(255,255,255,0.08)] shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
                          : "border-dashed border-white/12 bg-[rgba(255,255,255,0.04)]"
                      } ${rowIndex === 3 ? "text-center" : ""}`}
                    >
                      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                        {lineupSlotLabels[slot]}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {player ? player.player_name : "Open slot"}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/75">
                        {player
                          ? `${player.player_position} • ${player.club_name}`
                          : "Assign an eligible player"}
                      </p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="rounded-[1.2rem] border border-dashed border-white/12 bg-black/16 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong">
              Bench
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {benchLineupSlots.map((slot) => {
                const player = lineupLookup[slot];

                return (
                  <div
                    key={slot}
                    className="rounded-[1rem] border border-white/10 bg-white/6 px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-white">
                      {player ? player.player_name : lineupSlotLabels[slot]}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/75">
                      {player ? `${player.player_position} • ${player.club_name}` : "Bench slot"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
