"use client";

import { animate } from "animejs";
import { useLayoutEffect } from "react";
import { motionConfig } from "./motion-config";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

type RootRef = { current: HTMLElement | null };

/**
 * App screens load into a task, so arrival is a single short fade of the whole
 * page rather than a staged sequence. Motion in the console is kept for things
 * that change: sorted rows, dropdowns, the active nav item, printed totals.
 */
export function useEntrance(rootRef: RootRef, routeKey: string) {
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;
    const run = animate(root, {
      opacity: [0, 1],
      duration: motionConfig.base,
      ease: motionConfig.ease,
    });
    return () => {
      run.cancel();
      root.style.removeProperty("opacity");
    };
  }, [rootRef, routeKey, reduced]);
}
