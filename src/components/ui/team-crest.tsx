import Image from "next/image";
import { cn } from "@/lib/utils";

export interface TeamCrestProps {
  /** Team/club name, used as alt text */
  name: string;
  /** URL for the team crest. Falls back to abbreviation when absent. */
  src?: string | null;
  /** Rendered size in pixels (width and height) */
  size?: 24 | 32 | 40 | 48;
  className?: string;
}

const sizeClasses: Record<NonNullable<TeamCrestProps["size"]>, string> = {
  24: "size-6 text-[0.5rem]",
  32: "size-8 text-[0.6rem]",
  40: "size-10 text-xs",
  48: "size-12 text-sm",
};

function getAbbreviation(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

export function TeamCrest({
  name,
  src,
  size = 32,
  className,
}: TeamCrestProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-panel-strong font-bold text-muted",
        sizeClasses[size],
        className
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={`${name} crest`}
          width={size}
          height={size}
          className="size-full object-contain p-0.5"
          loading="lazy"
        />
      ) : (
        <span aria-hidden="true">{getAbbreviation(name)}</span>
      )}
    </span>
  );
}
