import Link from "next/link";
import { ArrowUpRight, Heart, Scale, ShieldCheck, Star } from "lucide-react";
import type { FantasyPoolPlayer } from "@/types/fantasy";
import { SurfaceCard } from "@/components/common/surface-card";
import { getButtonClassName } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

export interface PlayerCardProps {
  actionHref?: string;
  actionLabel?: string;
  compareDisabled?: boolean;
  detailHref?: string;
  isCompared?: boolean;
  isWatchlisted?: boolean;
  onToggleCompare?: () => void;
  onToggleWatchlist?: () => void;
  ownershipLabel?: string;
  player: FantasyPoolPlayer;
}

export function PlayerCard({
  actionHref,
  actionLabel,
  compareDisabled = false,
  detailHref,
  isCompared = false,
  isWatchlisted = false,
  onToggleCompare,
  onToggleWatchlist,
  ownershipLabel,
  player,
}: PlayerCardProps) {
  return (
    <SurfaceCard
      eyebrow={`${player.position} • ${player.club_name}`}
      title={player.display_name}
      description={`Rank ${player.rank} • ${player.average_points.toFixed(1)} avg fantasy points${player.salary_cost ? ` • $${player.salary_cost}` : ""}`}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Projection
            </p>
            <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
              {player.average_points.toFixed(1)}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Salary
            </p>
            <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
              ${player.salary_cost}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-white/6 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
              Pool rank
            </p>
            <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
              #{player.rank}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill tone={player.availability === "available" ? "success" : "default"}>
            <ShieldCheck className="size-3.5" />
            {player.availability}
          </Pill>
          <Pill tone="brand">
            <Star className="size-3.5" />
            {player.club_name}
          </Pill>
          {ownershipLabel ? (
            <Pill tone="default">{ownershipLabel}</Pill>
          ) : null}
          {isWatchlisted ? <Pill tone="accent">Watchlist</Pill> : null}
          {isCompared ? <Pill tone="brand">Compare tray</Pill> : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {actionHref && actionLabel ? (
            <Link
              href={actionHref}
              className={getButtonClassName({
                variant: "secondary",
              })}
            >
              {actionLabel}
            </Link>
          ) : null}
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
            href={detailHref ?? `/players/${player.id}`}
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
