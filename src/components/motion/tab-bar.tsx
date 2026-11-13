"use client";

import { animate } from "animejs";
import { useLayoutEffect, useRef } from "react";
import { motionConfig } from "@/lib/motion/motion-config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";

type Tab = { id: string; label?: string; count?: React.ReactNode };
type Box = { left: number; top: number; width: number; height: number };

/**
 * Tabs whose marker travels to the selected tab. The marker only uses
 * transform (underline) or clip-path (segmented), never width or left.
 */
export function TabBar({
  tabs,
  value,
  onChange,
  label,
  variant = "underline",
  className = "",
}: {
  tabs: (Tab | string)[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  variant?: "underline" | "segmented";
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLElement>(null);
  const previous = useRef<Box | null>(null);
  const items = tabs.map((tab) =>
    typeof tab === "string" ? { id: tab } : tab,
  );
  // What the marker's position depends on besides the selection itself.
  const signature = items
    .map((tab) => `${tab.id}:${tab.label ?? ""}:${String(tab.count ?? "")}`)
    .join("|");
  // If the value matches no tab, the first one keeps the list reachable.
  const focusable = items.some((tab) => tab.id === value)
    ? value
    : items[0]?.id;

  useLayoutEffect(() => {
    const list = listRef.current;
    const marker = markerRef.current;
    if (!list || !marker) return;
    const place = (box: Box) => {
      if (variant === "underline") {
        marker.style.transform = `translateX(${box.left}px) scaleX(${box.width})`;
        return;
      }
      const right = list.clientWidth - box.left - box.width;
      const bottom = list.clientHeight - box.top - box.height;
      marker.style.clipPath = `inset(${box.top}px ${right}px ${bottom}px ${box.left}px round 6px)`;
    };
    const measure = (): Box | null => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      return active
        ? {
            left: active.offsetLeft,
            top: active.offsetTop,
            width: active.offsetWidth,
            height: active.offsetHeight,
          }
        : null;
    };
    const next = measure();
    if (!next) {
      marker.style.opacity = "0";
      previous.current = null;
      return;
    }
    marker.style.opacity = "1";
    const from = previous.current;
    // A count badge can widen one tab and shift the rest without the list
    // itself changing size, so every tab is watched, not just the list.
    const resize = new ResizeObserver(() => {
      const box = measure();
      if (!box) return;
      previous.current = box;
      place(box);
    });
    const watch = () => {
      resize.observe(list);
      list
        .querySelectorAll('[role="tab"]')
        .forEach((tab) => resize.observe(tab));
    };
    if (reducedMotion || !from) {
      previous.current = next;
      place(next);
      watch();
      return () => resize.disconnect();
    }
    const state = { ...from };
    const animation = animate(state, {
      ...next,
      duration: motionConfig.base + 40,
      ease: motionConfig.ease,
      onUpdate: () => {
        // Track the in-flight box so a quick second change starts from where
        // the marker actually is.
        previous.current = { ...state };
        place(state);
      },
      onComplete: () => {
        previous.current = next;
        watch();
      },
    });
    return () => {
      animation.cancel();
      resize.disconnect();
    };
  }, [value, variant, reducedMotion, signature]);

  const move = (event: React.KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const targetIndex =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index + last) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    const target = items[targetIndex];
    if (!target) return;
    event.preventDefault();
    onChange(target.id);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(target.id)}"]`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={`tabbar tabbar-${variant} ${className}`}
    >
      <i ref={markerRef} className="tabbar-marker" aria-hidden="true" />
      {items.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab={tab.id}
          aria-selected={tab.id === value}
          tabIndex={tab.id === focusable ? 0 : -1}
          className="tabbar-tab"
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {tab.label ?? tab.id}
          {tab.count !== undefined && tab.count !== "" && (
            <small className="tabbar-count">{tab.count}</small>
          )}
        </button>
      ))}
    </div>
  );
}
