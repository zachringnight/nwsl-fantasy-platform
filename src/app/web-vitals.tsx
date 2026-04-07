"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    const analyticsId = process.env.NEXT_PUBLIC_ANALYTICS_ID;
    if (!analyticsId) return;

    const body = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
    };

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/vitals", JSON.stringify(body));
    }
  });

  return null;
}
