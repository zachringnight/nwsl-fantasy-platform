"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveMatchRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const refresh = () => router.refresh();
    const interval = window.setInterval(refresh, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, router]);

  if (!active) return null;

  return (
    <p className="text-center text-xs text-muted" aria-live="polite">
      Live score and stats refresh automatically every minute.
    </p>
  );
}
