"use client";

import { createTimeline, splitText, stagger, utils } from "animejs";
import { useRef } from "react";
import { motionConfig } from "@/lib/motion/motion-config";
import { useAnimeScope } from "@/lib/motion/use-anime-scope";

/* The brush glyphs lean past their own boxes, so the wipe is drawn with room
   to spare on every side and removed once the stroke has landed. */
const HIDDEN = "inset(-25% 135% -25% -35%)";
const SHOWN = "inset(-25% -35% -25% -35%)";

/**
 * The wordmark is painted on left to right, one brush stroke per letter, then
 * the line under it settles word by word and the action follows.
 */
export function LandingEntrance({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useAnimeScope(rootRef, () => {
    const root = rootRef.current;
    const subtitle = root?.querySelector<HTMLElement>(".landing-subtitle");
    if (!root || !subtitle) return;
    const split = splitText(subtitle, { words: true, chars: false });
    // Delayed tweens only take their starting values once they begin, so set
    // them up front and then lift the stylesheet's pre-hydration cover.
    utils.set(".wordmark-letter", { clipPath: HIDDEN });
    utils.set(split.words, { opacity: 0 });
    utils.set(".signin-link", { opacity: 0 });
    root.setAttribute("data-ready", "");
    createTimeline({ defaults: { ease: motionConfig.ease } })
      .add(".wordmark", { opacity: [0, 1], duration: 1 })
      .add(".wordmark-letter", {
        clipPath: [HIDDEN, SHOWN],
        x: [-10, 0],
        duration: motionConfig.landing,
        delay: stagger(40),
      })
      .add(
        split.words,
        {
          opacity: [0, 1],
          y: [8, 0],
          duration: motionConfig.enter,
          delay: stagger(32),
        },
        "-=320",
      )
      .add(
        ".signin-link",
        { opacity: [0, 1], y: [8, 0], duration: motionConfig.enter },
        "-=300",
      );
    return () => void split.revert();
  }, []);

  return (
    <div ref={rootRef} className="landing-content">
      {children}
    </div>
  );
}
