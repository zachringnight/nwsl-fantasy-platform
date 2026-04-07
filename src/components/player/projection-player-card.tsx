import Link from "next/link";
import { ArrowUpRight, Heart, Scale, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { ClubLogo } from "@/components/ui/club-logo";
import { Pill } from "@/components/ui/pill";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import type { PlayerProjectionRecord } from "@/lib/analytics/predictive";

export interface ProjectionPlayerCardProps {
  compareDisabled?: boolean;
  isCompared?: boolean;
  isWatchlisted?: boolean;
  onToggleCompare?: () => void;
  onToggleWatchlist?: () => void;
  player: PlayerProjectionRecord;
}

function confidenceTone(confidence: number) {
  if (confidence >= 0.74) return "success";
  if (confidence >= 0.58) return "brand";
  return "default";
}

function cleanSheetLabel(player: PlayerProjectionRecord) {
  if (player.cleanSheetChance == null) return null;
  return `${Math.round(player.cleanSheetChance * 100)}% clean sheet`;
}

function lineupTone(player: PlayerProjectionRecord) {
  if (player.lineupStatus === "Projected starter") return "success";
  if (player.lineupStatus === "Likely starter") return "brand";
  return "default";
}

export function ProjectionPlayerCard({
  compareDisabled = false,
  isCompared = false,
  isWatchlisted = false,
  onToggleCompare,
  onToggleWatchlist,
  player,
}: ProjectionPlayerCardProps) {
  return (
    <SurfaceCard
      eyebrow={`${player.position} • ${player.team}`}
      title={player.player}
      description={`${player.projection.toFixed(1)} proj • ${player.floor.toFixed(1)} floor • ${player.ceiling.toFixed(1)} ceiling • $${player.salary}`}
      className="h-full"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar name={player.player} src={null} size={56} />
          <div>
            <p className="text-sm font-semibold text-foreground">{player.player}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <ClubLogo club={player.team} size={16} />
              {player.team}
              {player.opponent ? ` • vs ${player.opponent}` : ""}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Projection
            </p>
            <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
              {player.projection.toFixed(1)}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Value
            </p>
            <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
              {player.valueScore.toFixed(2)}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Minutes
            </p>
            <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
              {player.expectedMinutes.toFixed(0)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill tone={player.availability === "available" ? "success" : "default"}>
            <ShieldCheck className="size-3.5" />
            {player.availability}
          </Pill>
          <Pill tone={lineupTone(player)}>
            {Math.round(player.starterProbability * 100)}% start
          </Pill>
          <Pill tone={lineupTone(player)}>{player.lineupStatus}</Pill>
          <Pill tone={confidenceTone(player.confidence)}>
            <Sparkles className="size-3.5" />
            {Math.round(player.confidence * 100)}% confidence
          </Pill>
          <Pill tone="brand">
            <TrendingUp className="size-3.5" />
            {player.matchupTag}
          </Pill>
          {player.matchDateLabel ? <Pill tone="default">{player.matchDateLabel}</Pill> : null}
          {cleanSheetLabel(player) ? <Pill tone="default">{cleanSheetLabel(player)}</Pill> : null}
          {isWatchlisted ? <Pill tone="accent">Watchlist</Pill> : null}
          {isCompared ? <Pill tone="brand">Compare tray</Pill> : null}
        </div>

        <div className="grid gap-2 text-sm text-muted">
          <div className="flex items-center justify-between rounded-full border border-line bg-white/5 px-4 py-2">
            <span>Floor / ceiling</span>
            <span className="font-semibold text-foreground">
              {player.floor.toFixed(1)} / {player.ceiling.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-full border border-line bg-white/5 px-4 py-2">
            <span>Shot + creation</span>
            <span className="font-semibold text-foreground">
              {player.shotVolume.toFixed(1)} / {player.creationVolume.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-full border border-line bg-white/5 px-4 py-2">
            <span>Lineup / risk</span>
            <span className="font-semibold text-foreground">
              {player.lineupStatus} • {player.riskLabel}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-[1.35rem] border border-line bg-white/5 p-4">
          <p className="text-sm leading-6 text-muted">{player.lineupNote}</p>
        </div>

        <div className="space-y-2 rounded-[1.35rem] border border-line bg-white/5 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
            Why the model likes this spot
          </p>
          <div className="space-y-2">
            {player.reasons.map((reason) => (
              <p key={`${player.id}-${reason}`} className="text-sm leading-6 text-foreground">
                {reason}
              </p>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {onToggleWatchlist ? (
            <button
              className={getButtonClassName({
                variant: isWatchlisted ? "accent" : "secondary",
              })}
              onClick={onToggleWatchlist}
              type="button"
            >
              <Heart className="size-4" />
              {isWatchlisted ? "Watching" : "Watchlist"}
            </button>
          ) : null}
          {onToggleCompare ? (
            <button
              className={getButtonClassName({
                variant: isCompared ? "primary" : "secondary",
              })}
              disabled={compareDisabled && !isCompared}
              onClick={onToggleCompare}
              type="button"
            >
              <Scale className="size-4" />
              {isCompared ? "Selected" : compareDisabled ? "Compare full" : "Compare"}
            </button>
          ) : null}
          <Link
            href={`/players/${player.id}`}
            className={getButtonClassName({
              className: "group",
            })}
          >
            View details
            <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </SurfaceCard>
  );
}
