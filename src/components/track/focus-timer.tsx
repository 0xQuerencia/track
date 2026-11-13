"use client";

import { animate } from "animejs";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveFocusSessionAction } from "@/app/actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { motionConfig } from "@/lib/motion/motion-config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";

const STORAGE_KEY = "track.focus.timer";

type Stored = { startedAt: number; label: string };

function readStored(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return typeof parsed.startedAt === "number"
      ? { startedAt: parsed.startedAt, label: String(parsed.label ?? "") }
      : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage can be blocked; the timer still works for this page view. */
  }
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

/** Start/stop focus timer. The start time survives a reload, and stopping saves the session. */
export function FocusTimer({ compact = false }: { compact?: boolean }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const ringRef = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setStartedAt(stored.startedAt);
      setLabel(stored.label);
    }
  }, []);

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // A slow breathing ring while the timer runs.
  useEffect(() => {
    const ring = ringRef.current;
    if (!ring || startedAt === null || reduced) return;
    const run = animate(ring, {
      scale: [1, 1.18],
      opacity: [0.5, 0],
      duration: 1800,
      loop: true,
      ease: motionConfig.ease,
    });
    return () => {
      run.cancel();
      ring.style.removeProperty("transform");
      ring.style.removeProperty("opacity");
    };
  }, [startedAt, reduced]);

  const running = startedAt !== null;

  const start = () => {
    const began = Date.now();
    setNotice(null);
    setStartedAt(began);
    writeStored({ startedAt: began, label });
  };

  const stop = () => {
    if (startedAt === null) return;
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
    const taskLabel = label;
    setStartedAt(null);
    writeStored(null);
    startTransition(async () => {
      const result = await saveFocusSessionAction(minutes, taskLabel);
      setNotice({ ok: !!result?.ok, text: result?.message ?? "Could not save." });
    });
  };

  const discard = () => {
    setStartedAt(null);
    writeStored(null);
    setNotice(null);
  };

  return (
    <div className="tk-timer" data-running={running || undefined} data-compact={compact || undefined}>
      <div className="tk-timer-face">
        <span ref={ringRef} className="tk-timer-ring" aria-hidden="true" />
        <output aria-live="off" className="tk-timer-time">
          {running ? clock(now - (startedAt ?? now)) : "00:00"}
        </output>
      </div>
      <div className="tk-timer-controls">
        <input
          type="text"
          value={label}
          maxLength={200}
          placeholder="What are you focusing on?"
          aria-label="Focus label"
          onChange={(event) => {
            setLabel(event.target.value);
            if (startedAt !== null)
              writeStored({ startedAt, label: event.target.value });
          }}
        />
        {running ? (
          <>
            <button type="button" className="tk-button tk-primary" onClick={stop} disabled={pending}>
              <Pause size={14} strokeWidth={1.75} aria-hidden="true" /> Stop &amp; save
            </button>
            <button type="button" className="tk-button tk-ghost" onClick={discard}>
              Discard
            </button>
          </>
        ) : (
          <button type="button" className="tk-button tk-primary" onClick={start} disabled={pending}>
            <Play size={14} strokeWidth={1.75} aria-hidden="true" /> Start focus
          </button>
        )}
      </div>
      {notice ? (
        <ActionNotice tone={notice.ok ? "info" : "error"} role={notice.ok ? "status" : "alert"}>
          {notice.text}
        </ActionNotice>
      ) : null}
    </div>
  );
}
