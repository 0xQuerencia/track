"use client";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

/** Chart draw time: the given duration, or none when the visitor prefers reduced motion. */
export function useChartDuration(ms = 900) {
  return usePrefersReducedMotion() ? 0 : ms;
}
