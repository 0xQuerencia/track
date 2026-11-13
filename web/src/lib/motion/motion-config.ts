import { cubicBezier } from "animejs";

/** One easing curve for the whole product: a quick start that settles. */
const ease = cubicBezier(0.22, 1, 0.36, 1);

export const motionConfig = {
  /** Hover, press, toggles. */
  fast: 140,
  /** Indicators and selections that travel. */
  base: 200,
  /** Menus, popovers, the command palette. */
  panel: 240,
  /** Blocks entering the page. */
  enter: 420,
  /** Figures counting to their value. */
  count: 720,
  /** One brush letter of the landing wordmark. */
  landing: 480,
  /** Gap between staggered items, capped at `maxStaggered` items. */
  stagger: 45,
  maxStaggered: 6,
  /** Rise distance in px for anything that enters. */
  rise: 10,
  ease,
  easeOut: ease,
} as const;

/** Stagger delay that stops growing after `maxStaggered` items. */
export const cappedStagger =
  (step: number = motionConfig.stagger, start = 0) =>
  (_target: unknown, index = 0) =>
    start + Math.min(index, motionConfig.maxStaggered) * step;
