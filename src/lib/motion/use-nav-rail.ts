"use client";

import { animate, createAnimatable, type JSAnimation } from "animejs";
import { useEffect, useRef } from "react";
import { motionConfig } from "./motion-config";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

type NavRef = { current: HTMLElement | null };

/**
 * The sidebar's active row is one surface that travels to the next item
 * instead of blinking off and on, and a fainter one that follows the pointer.
 * Both only translate, so the navigation itself never shifts.
 */
export function useNavRail(navRef: NavRef, routeKey: string) {
  const reducedMotion = usePrefersReducedMotion();
  const lastTop = useRef<number | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    const indicator = nav?.querySelector<HTMLElement>(".nav-indicator");
    if (!nav || !indicator) return;
    if (reducedMotion) {
      nav.removeAttribute("data-rail");
      indicator.style.opacity = "0";
      return;
    }
    nav.setAttribute("data-rail", "ready");
    const active = nav.querySelector<HTMLElement>(
      ':scope > .nav-item-wrap > [aria-current="page"]',
    );
    let animation: JSAnimation | undefined;
    if (!active) {
      animation = animate(indicator, {
        opacity: 0,
        duration: motionConfig.fast,
        ease: motionConfig.ease,
      });
      lastTop.current = null;
      return () => void animation?.cancel();
    }
    const top = active.offsetTop;
    indicator.style.height = `${active.offsetHeight}px`;
    const place = (y: number) => {
      indicator.style.transform = `translateY(${y}px)`;
      lastTop.current = y;
    };
    const from = lastTop.current;
    if (from === null) {
      // First placement shows at once, so the active row is never unmarked.
      place(top);
      indicator.style.opacity = "1";
      return;
    }
    indicator.style.opacity = "1";
    const state = { y: from };
    animation = animate(state, {
      y: top,
      duration: Math.min(360, motionConfig.base + Math.abs(top - from) * 0.6),
      ease: motionConfig.ease,
      // Tracking the in-flight position lets a quick second navigation start
      // from where the surface actually is.
      onUpdate: () => place(state.y),
      onComplete: () => place(top),
    });
    return () => void animation?.cancel();
  }, [navRef, routeKey, reducedMotion]);

  useEffect(() => {
    const nav = navRef.current;
    const hover = nav?.querySelector<HTMLElement>(".nav-hover");
    if (!nav || !hover || reducedMotion) return;
    const follow = createAnimatable(hover, {
      y: motionConfig.fast,
      opacity: motionConfig.fast,
      ease: motionConfig.ease,
    });
    let visible = false;
    const onOver = (event: PointerEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLElement>(
        ".nav-item-wrap > .navlink",
      );
      if (!link || !nav.contains(link)) return;
      hover.style.height = `${link.offsetHeight}px`;
      // Jump to the first row instead of sliding in from the top of the list.
      follow.y(link.offsetTop, visible ? motionConfig.fast : 0);
      follow.opacity(link.getAttribute("aria-current") === "page" ? 0 : 1);
      visible = true;
    };
    const onLeave = () => {
      follow.opacity(0);
      visible = false;
    };
    nav.addEventListener("pointerover", onOver);
    nav.addEventListener("pointerleave", onLeave);
    return () => {
      nav.removeEventListener("pointerover", onOver);
      nav.removeEventListener("pointerleave", onLeave);
      follow.revert();
    };
  }, [navRef, reducedMotion]);
}
