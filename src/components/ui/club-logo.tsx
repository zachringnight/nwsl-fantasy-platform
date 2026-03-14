"use client";

import Image from "next/image";
import { findClub } from "@/config/nwsl-clubs";
import { cn } from "@/lib/utils";

interface ClubLogoProps {
  /** Club name or abbreviation */
  club: string;
  /** Size in pixels (renders as width/height) */
  size?: number;
  className?: string;
}

/**
 * Renders an NWSL club logo with a colored fallback initial.
 * Falls back to a circle with the club's brand color and first letter.
 */
export function ClubLogo({ club, size = 24, className }: ClubLogoProps) {
  const matched = findClub(club);

  if (!matched) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-white/12 text-[0.6em] font-bold uppercase text-muted",
          className
        )}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {club.charAt(0)}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: `${matched.color}20`,
      }}
    >
      <Image
        alt=""
        src={matched.logo}
        width={Math.round(size * 0.7)}
        height={Math.round(size * 0.7)}
        className="object-contain"
        unoptimized={!matched.logo.startsWith("/")}
        onError={(e) => {
          // Fallback to abbreviation text on image load failure
          const target = e.currentTarget;
          target.style.display = "none";
          const parent = target.parentElement;
          if (parent && !parent.querySelector("[data-fallback]")) {
            const fallback = document.createElement("span");
            fallback.setAttribute("data-fallback", "true");
            fallback.textContent = matched.abbreviation;
            fallback.style.fontSize = `${size * 0.32}px`;
            fallback.style.fontWeight = "700";
            fallback.style.color = matched.color;
            fallback.style.letterSpacing = "0.04em";
            parent.appendChild(fallback);
          }
        }}
      />
    </span>
  );
}
