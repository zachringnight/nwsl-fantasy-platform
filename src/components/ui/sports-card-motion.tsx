"use client";

import {
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type SportsMotionTone = "cobalt" | "ember" | "volt";
export type SportsMotionSpeed = "slow" | "medium" | "fast";
export type SportsMotionRarityTone = "legendary" | "holo" | "rookie";
export type SportsMotionPossession = "away" | "home";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export interface BroadcastStageProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SportsMotionTone;
}

export function BroadcastStage({
  children,
  className,
  tone = "cobalt",
  ...props
}: BroadcastStageProps) {
  return (
    <section
      className={cn("sports-motion-stage", className)}
      data-motion-tone={tone}
      {...props}
    >
      <div className="sports-motion-stage__grid" aria-hidden="true" />
      <div className="sports-motion-stage__orb sports-motion-stage__orb--left" aria-hidden="true" />
      <div className="sports-motion-stage__orb sports-motion-stage__orb--right" aria-hidden="true" />
      <div className="sports-motion-stage__ribbon sports-motion-stage__ribbon--primary" aria-hidden="true" />
      <div className="sports-motion-stage__ribbon sports-motion-stage__ribbon--secondary" aria-hidden="true" />
      <div className="sports-motion-stage__content">{children}</div>
    </section>
  );
}

export interface TickerMarqueeProps extends HTMLAttributes<HTMLDivElement> {
  items: string[];
  speed?: SportsMotionSpeed;
}

export function TickerMarquee({
  className,
  items,
  speed = "medium",
  ...props
}: TickerMarqueeProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("sports-motion-ticker", className)} data-speed={speed} {...props}>
      <div className="sports-motion-ticker__belt">
        <div className="sports-motion-ticker__track">
          {items.map((item, index) => (
            <span className="sports-motion-ticker__chip" key={`primary-${index}-${item}`}>
              {item}
            </span>
          ))}
        </div>
        <div className="sports-motion-ticker__track" aria-hidden="true">
          {items.map((item, index) => (
            <span className="sports-motion-ticker__chip" key={`duplicate-${index}-${item}`}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface RarityPulseProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: SportsMotionRarityTone;
}

export function RarityPulse({
  className,
  label,
  tone = "holo",
  ...props
}: RarityPulseProps) {
  return (
    <span
      className={cn("sports-motion-rarity", className)}
      data-rarity-tone={tone}
      {...props}
    >
      <span className="sports-motion-rarity__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export interface FoilTiltCardProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
  subtitle: string;
  rating?: string;
  series?: string;
  tags?: string[];
  tone?: SportsMotionTone;
  children?: ReactNode;
}

const defaultFoilCardStyle = {
  "--foil-pointer-x": "50%",
  "--foil-pointer-y": "50%",
  "--foil-rotate-x": "0deg",
  "--foil-rotate-y": "0deg",
} as CSSProperties;

export function FoilTiltCard({
  children,
  className,
  eyebrow,
  rating,
  series,
  style,
  subtitle,
  tags = [],
  title,
  tone = "cobalt",
  ...props
}: FoilTiltCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  function setCardMotion(pointerX: string, pointerY: string, rotateX: string, rotateY: string) {
    const card = cardRef.current;
    if (!card) return;

    card.style.setProperty("--foil-pointer-x", pointerX);
    card.style.setProperty("--foil-pointer-y", pointerY);
    card.style.setProperty("--foil-rotate-x", rotateX);
    card.style.setProperty("--foil-rotate-y", rotateY);
  }

  function resetCardMotion() {
    setCardMotion("50%", "50%", "0deg", "0deg");
  }

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const rawX = (event.clientX - rect.left) / rect.width;
    const rawY = (event.clientY - rect.top) / rect.height;
    const ratioX = Math.min(Math.max(rawX, 0), 1);
    const ratioY = Math.min(Math.max(rawY, 0), 1);
    const rotateY = `${((ratioX - 0.5) * 16).toFixed(2)}deg`;
    const rotateX = `${((0.5 - ratioY) * 14).toFixed(2)}deg`;

    setCardMotion(`${(ratioX * 100).toFixed(2)}%`, `${(ratioY * 100).toFixed(2)}%`, rotateX, rotateY);
  }

  return (
    <article
      ref={cardRef}
      className={cn("sports-motion-foil-card", className)}
      data-motion-tone={tone}
      onBlur={resetCardMotion}
      onMouseLeave={resetCardMotion}
      onMouseMove={handleMouseMove}
      style={{ ...defaultFoilCardStyle, ...style }}
      {...props}
    >
      <div className="sports-motion-foil-card__inner">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {eyebrow ? (
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-white/68">
                {eyebrow}
              </p>
            ) : null}
            <div className="space-y-1">
              <h3 className="font-display text-[clamp(2.8rem,8vw,4.8rem)] uppercase leading-[0.82] tracking-[0.02em] text-white">
                {title}
              </h3>
              <p className="max-w-sm text-sm leading-6 text-white/82">{subtitle}</p>
            </div>
          </div>
          {rating ? (
            <div className="sports-motion-foil-card__rating">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/65">
                Rating
              </span>
              <span className="block text-3xl font-semibold leading-none tracking-[-0.06em] text-white">
                {rating}
              </span>
            </div>
          ) : null}
        </div>

        {series ? (
          <p className="mt-5 inline-flex items-center rounded-full border border-white/12 bg-black/18 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-white/72">
            {series}
          </p>
        ) : null}

        {tags.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/76"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {children ? <div className="sports-motion-foil-card__footer">{children}</div> : null}
      </div>
    </article>
  );
}

export interface CardFanItem {
  eyebrow?: string;
  title: string;
  meta: string;
  rarity?: string;
  rarityTone?: SportsMotionRarityTone;
  tone?: SportsMotionTone;
}

export interface CardFanProps extends HTMLAttributes<HTMLDivElement> {
  cards: CardFanItem[];
}

const defaultCardTones: SportsMotionTone[] = ["ember", "cobalt", "volt"];

export function CardFan({ cards, className, ...props }: CardFanProps) {
  return (
    <div className={cn("sports-motion-fan", className)} {...props}>
      {cards.slice(0, 3).map((card, index) => (
        <article
          key={`${card.title}-${index}`}
          className="sports-motion-fan__card"
          data-card-index={index}
          data-motion-tone={card.tone ?? defaultCardTones[index] ?? "cobalt"}
        >
          <div className="sports-motion-fan__card-inner">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                {card.eyebrow ? (
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-white/66">
                    {card.eyebrow}
                  </p>
                ) : null}
                <h3 className="font-display text-[2.4rem] uppercase leading-[0.86] tracking-[0.02em] text-white">
                  {card.title}
                </h3>
              </div>
              {card.rarity ? (
                <RarityPulse label={card.rarity} tone={card.rarityTone ?? "holo"} />
              ) : null}
            </div>
            <p className="max-w-[18rem] text-sm leading-6 text-white/78">{card.meta}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export interface SpotlightPanelProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SportsMotionTone;
}

export function SpotlightPanel({
  children,
  className,
  tone = "ember",
  ...props
}: SpotlightPanelProps) {
  return (
    <section
      className={cn("sports-motion-spotlight", className)}
      data-motion-tone={tone}
      {...props}
    >
      <div className="sports-motion-spotlight__content">{children}</div>
    </section>
  );
}

export interface BroadcastScoreBugProps extends HTMLAttributes<HTMLDivElement> {
  awayTeam: string;
  awayScore: number | string;
  homeTeam: string;
  homeScore: number | string;
  period: string;
  gameClock: string;
  shotClock?: number | string;
  possession?: SportsMotionPossession;
  status?: string;
  tone?: SportsMotionTone;
}

export function BroadcastScoreBug({
  awayScore,
  awayTeam,
  className,
  gameClock,
  homeScore,
  homeTeam,
  period,
  possession = "home",
  shotClock,
  status = "Live",
  tone = "cobalt",
  ...props
}: BroadcastScoreBugProps) {
  return (
    <section
      className={cn("sports-motion-scorebug", className)}
      data-motion-tone={tone}
      data-possession={possession}
      {...props}
    >
      <div className="sports-motion-scorebug__status-row">
        <span className="sports-motion-scorebug__status-pill">{status}</span>
        <span className="sports-motion-scorebug__clock">{period}</span>
      </div>

      <div className="sports-motion-scorebug__body">
        <div className="sports-motion-scorebug__team" data-side="away">
          <span className="sports-motion-scorebug__pulse" aria-hidden="true" />
          <span className="sports-motion-scorebug__team-name">{awayTeam}</span>
          <span className="sports-motion-scorebug__team-score">{awayScore}</span>
        </div>

        <div className="sports-motion-scorebug__center">
          <span className="sports-motion-scorebug__game-clock">{gameClock}</span>
          {shotClock !== undefined ? (
            <span className="sports-motion-scorebug__shot-clock">{shotClock}</span>
          ) : null}
        </div>

        <div className="sports-motion-scorebug__team" data-side="home">
          <span className="sports-motion-scorebug__pulse" aria-hidden="true" />
          <span className="sports-motion-scorebug__team-name">{homeTeam}</span>
          <span className="sports-motion-scorebug__team-score">{homeScore}</span>
        </div>
      </div>
    </section>
  );
}

export interface PlayerLowerThirdProps extends HTMLAttributes<HTMLDivElement> {
  playerName: string;
  teamName: string;
  role: string;
  number?: string;
  eyebrow?: string;
  tags?: string[];
  tone?: SportsMotionTone;
}

export function PlayerLowerThird({
  className,
  eyebrow = "Player Intro",
  number,
  playerName,
  role,
  tags = [],
  teamName,
  tone = "ember",
  ...props
}: PlayerLowerThirdProps) {
  return (
    <section
      className={cn("sports-motion-lower-third", className)}
      data-motion-tone={tone}
      {...props}
    >
      {number ? <div className="sports-motion-lower-third__number">{number}</div> : null}
      <div className="sports-motion-lower-third__content">
        <p className="sports-motion-lower-third__eyebrow">{eyebrow}</p>
        <div className="space-y-1">
          <h3 className="sports-motion-lower-third__name">{playerName}</h3>
          <p className="sports-motion-lower-third__role">
            {teamName} • {role}
          </p>
        </div>
        {tags.length > 0 ? (
          <div className="sports-motion-lower-third__tags">
            {tags.map((tag) => (
              <span key={tag} className="sports-motion-lower-third__tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export interface CountdownRingProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  max: number;
  detail?: string;
  tone?: SportsMotionTone;
}

export function CountdownRing({
  className,
  detail,
  label,
  max,
  tone = "ember",
  value,
  ...props
}: CountdownRingProps) {
  const safeMax = max > 0 ? max : 1;
  const normalizedValue = clamp(value, 0, safeMax);
  const progress = normalizedValue / safeMax;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <section
      className={cn("sports-motion-countdown", className)}
      data-motion-tone={tone}
      {...props}
    >
      <div
        className="sports-motion-countdown__ring"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={normalizedValue}
      >
        <svg viewBox="0 0 120 120" className="sports-motion-countdown__svg" aria-hidden="true">
          <circle className="sports-motion-countdown__track" cx="60" cy="60" r={radius} />
          <circle
            className="sports-motion-countdown__bar"
            cx="60"
            cy="60"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="sports-motion-countdown__value-wrap">
          <span className="sports-motion-countdown__label">{label}</span>
          <span className="sports-motion-countdown__value">{normalizedValue}</span>
          {detail ? <span className="sports-motion-countdown__detail">{detail}</span> : null}
        </div>
      </div>
    </section>
  );
}

export interface MomentumRailProps extends HTMLAttributes<HTMLDivElement> {
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
  caption?: string;
  tone?: SportsMotionTone;
}

export function MomentumRail({
  caption,
  className,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  tone = "cobalt",
  ...props
}: MomentumRailProps) {
  const safeLeft = Math.max(leftValue, 0);
  const safeRight = Math.max(rightValue, 0);
  const total = safeLeft + safeRight || 1;
  const leftPercent = (safeLeft / total) * 100;
  const rightPercent = (safeRight / total) * 100;
  const leadingSide = safeLeft === safeRight ? "even" : safeLeft > safeRight ? "left" : "right";

  return (
    <section
      className={cn("sports-motion-momentum", className)}
      data-leading={leadingSide}
      data-motion-tone={tone}
      {...props}
    >
      <div className="sports-motion-momentum__header">
        <div>
          <p className="sports-motion-momentum__label">{leftLabel}</p>
          <p className="sports-motion-momentum__value">{safeLeft}%</p>
        </div>
        {caption ? <p className="sports-motion-momentum__caption">{caption}</p> : null}
        <div className="text-right">
          <p className="sports-motion-momentum__label">{rightLabel}</p>
          <p className="sports-motion-momentum__value">{safeRight}%</p>
        </div>
      </div>

      <div className="sports-motion-momentum__rail">
        <div
          className="sports-motion-momentum__fill sports-motion-momentum__fill--left"
          style={{ width: `${leftPercent}%` }}
        />
        <div className="sports-motion-momentum__center-line" aria-hidden="true" />
        <div
          className="sports-motion-momentum__fill sports-motion-momentum__fill--right"
          style={{ width: `${rightPercent}%` }}
        />
      </div>
    </section>
  );
}

export interface PulseMetricItem {
  label: string;
  value: string;
  delta: string;
  trend?: "up" | "down" | "steady";
}

export interface PulseMetricStripProps extends HTMLAttributes<HTMLDivElement> {
  metrics: PulseMetricItem[];
  tone?: SportsMotionTone;
}

export function PulseMetricStrip({
  className,
  metrics,
  tone = "volt",
  ...props
}: PulseMetricStripProps) {
  return (
    <section
      className={cn("sports-motion-pulse-strip", className)}
      data-motion-tone={tone}
      {...props}
    >
      {metrics.map((metric, index) => (
        <article
          key={`${metric.label}-${index}`}
          className="sports-motion-pulse-strip__item"
          data-trend={metric.trend ?? "up"}
          style={{ "--metric-delay": `${index * 120}ms` } as CSSProperties}
        >
          <p className="sports-motion-pulse-strip__metric-label">{metric.label}</p>
          <div className="sports-motion-pulse-strip__metric-row">
            <span className="sports-motion-pulse-strip__metric-value">{metric.value}</span>
            <span className="sports-motion-pulse-strip__metric-delta">{metric.delta}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

export interface HeatZoneItem {
  label: string;
  value: number;
}

export interface ZoneHeatGridProps extends HTMLAttributes<HTMLDivElement> {
  zones: HeatZoneItem[];
  title?: string;
  tone?: SportsMotionTone;
}

export function ZoneHeatGrid({
  className,
  title = "Shot Zone Activity",
  tone = "ember",
  zones,
  ...props
}: ZoneHeatGridProps) {
  const normalizedZones = zones.map((zone, index) => {
    const strength = clamp(zone.value / 100, 0.1, 1);

    return {
      ...zone,
      background: `linear-gradient(180deg, rgba(255,184,71,${0.14 + strength * 0.34}), rgba(0,225,255,${0.08 + strength * 0.2}))`,
      delay: `${index * 70}ms`,
    };
  });

  return (
    <section
      className={cn("sports-motion-heat-grid", className)}
      data-motion-tone={tone}
      {...props}
    >
      <p className="sports-motion-heat-grid__title">{title}</p>
      <div className="sports-motion-heat-grid__matrix">
        {normalizedZones.map((zone) => (
          <article
            key={zone.label}
            className="sports-motion-heat-grid__cell"
            style={{
              animationDelay: zone.delay,
              background: zone.background,
            }}
          >
            <span className="sports-motion-heat-grid__cell-label">{zone.label}</span>
            <span className="sports-motion-heat-grid__cell-value">{zone.value}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
