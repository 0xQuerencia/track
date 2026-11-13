"use client";

import { animate } from "animejs";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motionConfig } from "@/lib/motion/motion-config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";

const defaultFormat = (value: number) =>
  new Intl.NumberFormat().format(Math.round(value));

/**
 * A figure that counts to its value when it first scrolls into view and
 * tweens whenever the value changes afterwards. Screen readers always get the
 * final value; the moving digits are presentational.
 */
export function CountUp({
  value,
  format = defaultFormat,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const displayRef = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const formatRef = useRef(format);
  // The moving digits are written by the tween. React only ever renders their
  // first text, so a new value cannot flash in ahead of its own animation.
  const [initialText] = useState(() => format(value));
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useLayoutEffect(() => {
    const node = displayRef.current;
    if (!node) return;
    const write = (next: number) => {
      node.textContent = formatRef.current(next);
    };
    if (reducedMotion || !Number.isFinite(value)) {
      shown.current = value;
      write(value);
      return;
    }
    const startFrom = shown.current;
    const state = {
      current: startFrom !== null && Number.isFinite(startFrom) ? startFrom : 0,
    };
    const run = () =>
      animate(state, {
        current: value,
        duration:
          shown.current === null ? motionConfig.count : motionConfig.enter,
        ease: motionConfig.ease,
        onUpdate: () => write(state.current),
        onComplete: () => {
          shown.current = value;
          write(value);
        },
      });
    if (shown.current !== null) {
      const animation = run();
      return () => {
        shown.current = state.current;
        animation.cancel();
      };
    }
    // First appearance: wait until the figure is actually on screen.
    write(0);
    let animation: ReturnType<typeof run> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      animation = run();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (animation) {
        shown.current = state.current;
        animation.cancel();
      }
    };
  }, [value, reducedMotion]);

  return (
    <span className={className}>
      <span className="sr-only">{format(value)}</span>
      <span ref={displayRef} aria-hidden="true" suppressHydrationWarning>
        {initialText}
      </span>
    </span>
  );
}
