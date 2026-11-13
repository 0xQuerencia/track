"use client";

import { createTimeline, svg } from "animejs";
import { useRef } from "react";
import { motionConfig } from "@/lib/motion/motion-config";
import { useAnimeScope } from "@/lib/motion/use-anime-scope";

/**
 * Confirmation that an action landed: the row rises in and its mark is drawn
 * stroke by stroke. Replays when the message changes.
 */
export function ActionNotice({
  children,
  tone = "info",
  role = "status",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "info" | "error";
  role?: "status" | "alert";
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const replayKey = typeof children === "string" ? children : "";

  useAnimeScope(rootRef, () => {
    const root = rootRef.current;
    if (!root) return;
    createTimeline({ defaults: { ease: motionConfig.ease } })
      .add(root, { opacity: [0, 1], y: [-6, 0], duration: motionConfig.panel })
      .add(
        svg.createDrawable(
          root.querySelectorAll(
            ".action-notice-mark path, .action-notice-mark circle",
          ),
        ),
        {
          draw: ["0 0", "0 1"],
          duration: motionConfig.enter,
          delay: (_target: unknown, index = 0) => index * 90,
        },
        "-=120",
      );
  }, [replayKey]);

  return (
    <div
      ref={rootRef}
      className={`action-notice action-notice-${tone} ${className}`}
      role={role}
    >
      <svg
        className="action-notice-mark"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.25" />
        {tone === "error" ? (
          <path d="M8 4.75v3.75M8 11.1v.15" />
        ) : (
          <path d="M5.25 8.25l1.9 1.9 3.6-4" />
        )}
      </svg>
      <div className="action-notice-body">{children}</div>
    </div>
  );
}
