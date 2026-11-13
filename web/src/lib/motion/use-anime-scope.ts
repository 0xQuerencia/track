"use client";

import { createScope, type Scope } from "animejs";
import { useLayoutEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

type RootRef = { current: HTMLElement | SVGElement | null };

/**
 * Creates a component-scoped Anime.js v4 scope and reverts all animations on
 * unmount. The callback is kept in a ref so animation setup can be declared
 * inline without replaying on every render. A setup may return a cleanup for
 * anything the scope cannot revert on its own, such as split text.
 */
export function useAnimeScope(
  rootRef: RootRef,
  setup: (scope: Scope) => void | (() => void),
  dependencies: readonly unknown[] = [],
) {
  const setupRef = useRef(setup);
  useLayoutEffect(() => {
    setupRef.current = setup;
  }, [setup]);
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    if (reducedMotion || !rootRef.current) return;
    const scope = createScope({ root: rootRef });
    scope.add(() => setupRef.current(scope));
    return () => scope.revert();
    // The caller controls replay with the explicit dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, reducedMotion, ...dependencies]);

  return reducedMotion;
}
