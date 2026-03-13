import { LineupPitch } from "@/components/lineup/lineup-pitch";
import { SurfaceCard } from "@/components/common/surface-card";
import { StatusBanner } from "@/components/common/status-banner";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import {
  getEligibleLineupSlots,
  lineupSlotLabels,
  starterLineupSlots,
} from "@/lib/fantasy-draft";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type {
  FantasyLineupSlot,
  FantasyRosterPlayer,
} from "@/types/fantasy";

const starterLineupCount = 9;

export interface ClassicTeamManagerProps {
  assignments: Record<string, FantasyLineupSlot | "">;
  error: string;
  isSaving: boolean;
  missingStarterSlots: FantasyLineupSlot[];
  onAssignmentChange: (rosterId: string, slot: FantasyLineupSlot | "") => void;
  onAutofill: () => Promise<void>;
  onSave: () => Promise<void>;
  roster: FantasyRosterPlayer[];
}

export function ClassicTeamManager({
  assignments,
  error,
  isSaving,
  missingStarterSlots,
  onAssignmentChange,
  onAutofill,
  onSave,
  roster,
}: ClassicTeamManagerProps) {
  const rosterWithAssignments = roster.map((player) => ({
    ...player,
    lineup_slot: (assignments[player.id] || null) as FantasyLineupSlot | null,
  }));
  const starterCount = starterLineupCount - missingStarterSlots.length;
  const starters = rosterWithAssignments.filter(
    (player) => player.lineup_slot && starterLineupSlots.includes(player.lineup_slot)
  );
  const benchPlayers = rosterWithAssignments.filter(
    (player) => !player.lineup_slot || !starterLineupSlots.includes(player.lineup_slot)
  );
  const starterProjection = starters.reduce(
    (total, player) => total + player.player.average_points,
    0
  );
  const benchProjection = benchPlayers.reduce(
    (total, player) => total + player.player.average_points,
    0
  );
  const projectionDriver = [...starters].sort(
    (left, right) => right.player.average_points - left.player.average_points
  )[0] ?? null;
  const roleLeader = starters.reduce<Record<"GK" | "DEF" | "MID" | "FWD", number>>(
    (accumulator, player) => {
      accumulator[player.player_position] += player.player.average_points;
      return accumulator;
    },
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );
  const strongestRole =
    Object.entries(roleLeader).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "MID";
  const readinessLabel =
    missingStarterSlots.length === 0
      ? "Lineup is balanced and ready to save."
      : `Open starter slots: ${missingStarterSlots.map((slot) => lineupSlotLabels[slot]).join(", ")}`;

  return (
    <section className="space-y-5">
      {error ? (
        <StatusBanner message={error} title="Lineup action" tone="warning" />
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <LineupPitch roster={rosterWithAssignments} />

        <div className="space-y-5">
          <SurfaceCard
            description="Set legal starters, review lineup projection, and save changes from one team view."
            eyebrow="Classic team"
            title={missingStarterSlots.length === 0 ? "Lineup is legal" : "Finish the starters"}
            tone="accent"
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  detail="Starter compliance matters more than total roster count."
                  label="Starters filled"
                  tone={missingStarterSlots.length === 0 ? "brand" : "default"}
                  value={`${starterCount}/${starterLineupCount}`}
                />
                <MetricTile
                  detail={
                    missingStarterSlots.length === 0
                      ? "The lineup can be saved immediately."
                      : `Open slots: ${missingStarterSlots.map((slot) => lineupSlotLabels[slot]).join(", ")}`
                  }
                  label="Readiness"
                  tone={missingStarterSlots.length === 0 ? "accent" : "default"}
                  value={missingStarterSlots.length === 0 ? "Ready" : "Incomplete"}
                />
                <MetricTile
                  detail="Sum of current starter average fantasy points."
                  label="Lineup projection"
                  tone="brand"
                  value={starterProjection.toFixed(1)}
                />
                <MetricTile
                  detail="Projected points currently waiting on the bench."
                  label="Bench pressure"
                  tone="accent"
                  value={benchProjection.toFixed(1)}
                />
              </div>

              <div className="rounded-[1.3rem] border border-line bg-black/18 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Tactical read
                </p>
                <p className="mt-3 text-sm leading-7 text-white/84">{readinessLabel}</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[1.3rem] border border-line bg-black/18 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Projection model
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/84">
                    Weekly lineup projection is the sum of each current starter&apos;s average fantasy points. Live score starts with appearance ({launchScoringRules.appearance}) and 60+ minute ({launchScoringRules.minutes60Plus}) base points, then moves on event scoring.
                  </p>
                </div>
                <div className="rounded-[1.3rem] border border-line bg-black/18 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Scoring driver
                  </p>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {projectionDriver
                      ? `${projectionDriver.player_name} leads at ${projectionDriver.player.average_points.toFixed(1)} pts`
                      : "Add starters to create a real projection"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/74">
                    Strongest role lane: {strongestRole}. Read goals, assists, clean sheets, and saves against the players currently filling those starter slots.
                  </p>
                </div>
              </div>

              <StatusBanner
                message={
                  missingStarterSlots.length === 0
                    ? "Every starter slot is filled. Save to persist the current arrangement."
                    : `Open starter slots: ${missingStarterSlots.map((slot) => lineupSlotLabels[slot]).join(", ")}`
                }
                title={missingStarterSlots.length === 0 ? "Ready" : "Missing starters"}
                tone={missingStarterSlots.length === 0 ? "success" : "warning"}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    void onAutofill();
                  }}
                  type="button"
                  variant="secondary"
                >
                  {isSaving ? "Working..." : "Autofill best lineup"}
                </Button>
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    void onSave();
                  }}
                  type="button"
                >
                  {isSaving ? "Saving..." : "Save lineup"}
                </Button>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <SurfaceCard
        description="Set every player into a legal role so lineup decisions stay clear before kickoff."
        eyebrow="Slot editor"
        title="Assign every player to a legal role"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {roster.map((player) => (
            <label
              key={player.id}
              className="rounded-[1.3rem] border border-line bg-panel-soft px-4 py-4 transition hover:border-brand-strong/24 hover:bg-white/7"
            >
              <span className="block text-sm font-medium text-foreground">
                {player.player_name}
              </span>
              <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-muted">
                {player.player_position} • {player.club_name}
              </span>
              <span className="mt-3 inline-flex rounded-full border border-line bg-white/6 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-strong">
                {assignments[player.id] ? lineupSlotLabels[assignments[player.id] as FantasyLineupSlot] : "Unassigned"}
              </span>
              <select
                className="field-control mt-3"
                onChange={(event) => {
                  onAssignmentChange(player.id, event.target.value as FantasyLineupSlot | "");
                }}
                value={assignments[player.id] ?? ""}
              >
                <option value="">Unassigned</option>
                {getEligibleLineupSlots(player.player_position).map((slot) => (
                  <option key={slot} value={slot}>
                    {lineupSlotLabels[slot]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </SurfaceCard>
    </section>
  );
}
