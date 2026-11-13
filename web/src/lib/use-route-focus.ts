"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Client-side navigation does not move focus or tell a screen reader that the
 * page changed. After each route change (not the first load) this moves focus
 * to the main region and returns the new page's heading as a polite message.
 */
export function useRouteFocus(
  mainRef: RefObject<HTMLElement | null>,
  routeKey: string,
) {
  const lastKey = useRef(routeKey);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Compare with the last route seen so Strict Mode's second effect run
    // on first load is not mistaken for a navigation.
    if (lastKey.current === routeKey) return;
    lastKey.current = routeKey;
    const frame = requestAnimationFrame(() => {
      const main = mainRef.current;
      if (!main) return;
      main.focus({ preventScroll: true });
      const heading = main.querySelector("h1")?.textContent?.trim();
      setAnnouncement(heading ? `${heading} page` : "Page changed");
    });
    return () => cancelAnimationFrame(frame);
  }, [mainRef, routeKey]);

  return announcement;
}
