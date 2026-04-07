"use client";

interface LiveRegionProps {
  message: string;
  politeness?: "polite" | "assertive";
}

/**
 * Screen reader announcement component.
 * Renders an aria-live region that announces the message to assistive technology.
 * Change the message prop to trigger a new announcement.
 */
export function LiveRegion({ message, politeness = "polite" }: LiveRegionProps) {
  return (
    <div
      aria-live={politeness}
      aria-atomic="true"
      role="status"
      className="sr-only"
    >
      {message}
    </div>
  );
}
