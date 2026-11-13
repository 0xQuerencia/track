"use client";

import { animate } from "animejs";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { cappedStagger, motionConfig } from "@/lib/motion/motion-config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";

/**
 * Staggers its direct children into view with Anime.js when the route
 * changes. Only transform and opacity move, and reduced motion skips it.
 */
export function Rise({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;
    const targets = Array.from(root.children) as HTMLElement[];
    const run = animate(targets, {
      opacity: [0, 1],
      y: [motionConfig.rise, 0],
      duration: motionConfig.enter,
      delay: cappedStagger(),
      ease: motionConfig.ease,
    });
    // Safety net: if frames are throttled (a background tab, a busy page), the
    // content must still end up visible, so jump to the end state.
    const fallback = window.setTimeout(() => run.complete(), 1500);
    return () => {
      window.clearTimeout(fallback);
      run.cancel();
      for (const el of targets) {
        el.style.removeProperty("opacity");
        el.style.removeProperty("transform");
      }
    };
  }, [pathname, reduced]);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
