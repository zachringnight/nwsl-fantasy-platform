import Image from "next/image";
import { cn } from "@/lib/utils";

export interface PlayerAvatarProps {
  /** Player display name, used as alt text */
  name: string;
  /** URL for the player headshot. Falls back to initials when absent. */
  src?: string | null;
  /** Rendered size in pixels (width and height) */
  size?: 40 | 48 | 56 | 64 | 80;
  className?: string;
}

const sizeClasses: Record<NonNullable<PlayerAvatarProps["size"]>, string> = {
  40: "size-10 text-sm",
  48: "size-12 text-sm",
  56: "size-14 text-base",
  64: "size-16 text-lg",
  80: "size-20 text-xl",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function PlayerAvatar({
  name,
  src,
  size = 48,
  className,
}: PlayerAvatarProps) {
  const initials = getInitials(name);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-panel-strong font-semibold text-muted",
        sizeClasses[size],
        className
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
