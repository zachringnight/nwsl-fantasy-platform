"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";
import { ClubLogo } from "@/components/ui/club-logo";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import type { AvailabilityStatus, PlayerPosition } from "@/types/fantasy";
import styles from "./player-spotlight-card.module.css";

export interface PlayerSpotlightCardProps {
  appearances: number;
  availability: AvailabilityStatus;
  averagePoints: number;
  clubName: string;
  photoUrl?: string | null;
  playerName: string;
  position: PlayerPosition;
  primaryStatLabel: string;
  primaryStatValue: number;
  rank: number;
  salaryCost: number;
  statsSeason: string;
}

const defaultMotionStyle = {
  "--foil-pointer-x": "50%",
  "--foil-pointer-y": "50%",
  "--foil-rotate-x": "0deg",
  "--foil-rotate-y": "0deg",
} as CSSProperties;

export function PlayerSpotlightCard({
  appearances,
  availability,
  averagePoints,
  clubName,
  photoUrl,
  playerName,
  position,
  primaryStatLabel,
  primaryStatValue,
  rank,
  salaryCost,
  statsSeason,
}: PlayerSpotlightCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  function setMotion(pointerX: string, pointerY: string, rotateX: string, rotateY: string) {
    const card = cardRef.current;
    if (!card) return;

    card.style.setProperty("--foil-pointer-x", pointerX);
    card.style.setProperty("--foil-pointer-y", pointerY);
    card.style.setProperty("--foil-rotate-x", rotateX);
    card.style.setProperty("--foil-rotate-y", rotateY);
  }

  function resetMotion() {
    setMotion("50%", "50%", "0deg", "0deg");
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType && event.pointerType !== "mouse") return;

    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const ratioX = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const ratioY = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    const rotateY = `${((ratioX - 0.5) * 10).toFixed(2)}deg`;
    const rotateX = `${((0.5 - ratioY) * 8).toFixed(2)}deg`;

    setMotion(
      `${(ratioX * 100).toFixed(2)}%`,
      `${(ratioY * 100).toFixed(2)}%`,
      rotateX,
      rotateY
    );
  }

  return (
    <article
      ref={cardRef}
      aria-label={`${playerName} fantasy player card`}
      className={styles.card}
      data-position={position}
      onBlur={resetMotion}
      onPointerLeave={resetMotion}
      onPointerMove={handlePointerMove}
      style={defaultMotionStyle}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <PlayerAvatar
            className={styles.avatar}
            name={playerName}
            size={80}
            src={photoUrl}
          />
          <div>
            <p className={styles.eyebrow}>{position} fantasy card</p>
            <h2 className={styles.name}>{playerName}</h2>
            <p className={styles.club}>
              <ClubLogo club={clubName} size={16} />
              {clubName}
            </p>
          </div>
        </div>
        <div className={styles.rank}>
          <span className={styles.rankLabel}>Pool rank</span>
          <span className={styles.rankValue}>#{rank}</span>
        </div>
      </header>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Projection</span>
          <span className={styles.metricValue}>{averagePoints.toFixed(1)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Salary</span>
          <span className={styles.metricValue}>${salaryCost}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{primaryStatLabel}</span>
          <span className={styles.metricValue}>{primaryStatValue}</span>
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.badge}>
          <span className={styles.badgeDot} aria-hidden="true" />
          {availability}
        </span>
        <span className={styles.season}>
          {appearances} appearances · {statsSeason}
        </span>
      </footer>
    </article>
  );
}
