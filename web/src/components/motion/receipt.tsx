"use client";

import { useRef } from "react";
import { animate, stagger, utils } from "animejs";
import { motionConfig } from "@/lib/motion/motion-config";
import { useAnimeScope } from "@/lib/motion/use-anime-scope";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";

/**
 * A landed-cost breakdown set like a printed receipt. Each line is fed out of
 * the top in turn, then the total is stamped. It prints again whenever the
 * figures it shows change (`replayKey`), which is how a currency or country
 * switch reads as a new calculation rather than a silent swap.
 */
export function Receipt({
  replayKey,
  children,
}: {
  replayKey: string | number;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useAnimeScope(rootRef, () => {
    if (reduced) return;
    const lines =
      rootRef.current?.querySelectorAll(".receipt > div:not(.cost-total)")
        .length ?? 0;
    utils.set(".receipt > div:not(.cost-total)", { opacity: 0 });
    utils.set(".cost-total", { opacity: 0 });
    animate(".receipt > div:not(.cost-total)", {
      opacity: [0, 1],
      clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"],
      y: [-6, 0],
      duration: motionConfig.enter,
      delay: stagger(motionConfig.stagger + 25),
      ease: motionConfig.ease,
    });
    animate(".cost-total", {
      opacity: [0, 1],
      scale: [1.04, 1],
      duration: motionConfig.enter,
      delay: lines * (motionConfig.stagger + 25) + 120,
      ease: motionConfig.ease,
    });
  }, [replayKey, reduced]);

  return (
    <div ref={rootRef} className="cost-lines receipt">
      {children}
    </div>
  );
}
