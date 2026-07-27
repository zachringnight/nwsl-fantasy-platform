"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function getMotionPreference(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeToMotionPreference(onChange: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }

  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  const handleChange = () => onChange();

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }

  query.addListener(handleChange);
  return () => query.removeListener(handleChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    getMotionPreference,
    () => true
  );
}
