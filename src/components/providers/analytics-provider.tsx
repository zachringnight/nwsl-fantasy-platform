"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics/events";

export interface AnalyticsProviderProps {
  children: ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const pathname = usePathname();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return <>{children}</>;
}
