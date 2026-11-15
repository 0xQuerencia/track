import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/*
 * Draft recovery for long-form editors. While someone types, the draft is
 * kept in localStorage (per record id) so a crash, a closed tab or a failed
 * save does not lose the text. Storage is per-viewer and best-effort: every
 * read and write is wrapped in try/catch, and the editor works without it.
 *
 * A draft is offered back only when it differs from the saved record. A draft
 * written by this same editor is never offered back to it.
 */

const PREFIX = "track:draft:";
const CHANGE_EVENT = "track:draft-change";
export const AUTOSAVE_MS = 800;

export type DraftValues = Record<string, string>;
export type Draft = { savedAt: string; values: DraftValues };

export const draftKey = (scope: string, id: number): string => `${PREFIX}${scope}:${id}`;

export function encodeDraft(values: DraftValues, now: Date = new Date()): string {
  return JSON.stringify({ v: 1, savedAt: now.toISOString(), values });
}

/** Parses a stored draft. Anything malformed is treated as no draft. */
export function decodeDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const record = data as { v?: unknown; savedAt?: unknown; values?: unknown };
    if (record.v !== 1 || typeof record.savedAt !== "string") return null;
    if (typeof record.values !== "object" || record.values === null) return null;
    const values: DraftValues = {};
    for (const [field, value] of Object.entries(record.values as Record<string, unknown>))
      if (typeof value === "string") values[field] = value;
    return { savedAt: record.savedAt, values };
  } catch {
    return null;
  }
}

/** True when any field differs from the saved baseline. */
export function draftDiffers(values: DraftValues, baseline: DraftValues): boolean {
  const fields = new Set([...Object.keys(values), ...Object.keys(baseline)]);
  for (const field of fields) if ((values[field] ?? "") !== (baseline[field] ?? "")) return true;
  return false;
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, raw: string): void {
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Storage is full or blocked: the editor keeps working without a draft.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function removeDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing stored, or storage blocked.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeTo(key: string): (notify: () => void) => () => void {
  return (notify) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) notify();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, notify);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, notify);
    };
  };
}

/**
 * Autosaves the editor's values and offers a stored draft back on mount.
 * `values` are what the editor shows now; `baseline` is the saved record.
 */
export function useDraftRecovery(
  key: string,
  values: DraftValues,
  baseline: DraftValues,
): {
  pending: Draft | null;
  restore: () => DraftValues | null;
  discard: () => void;
  clear: () => void;
} {
  const serialized = JSON.stringify(values);
  const baselineSerialized = JSON.stringify(baseline);
  const subscribe = useMemo(() => subscribeTo(key), [key]);
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const [ownRaw, setOwnRaw] = useState<string | null>(null);
  const [dismissedRaw, setDismissedRaw] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = JSON.parse(serialized) as DraftValues;
      const saved = JSON.parse(baselineSerialized) as DraftValues;
      if (draftDiffers(current, saved)) {
        touched.current = true;
        const encoded = encodeDraft(current);
        writeRaw(key, encoded);
        setOwnRaw(encoded);
      } else if (touched.current) {
        touched.current = false;
        removeDraft(key);
        setOwnRaw(null);
      }
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [key, serialized, baselineSerialized]);

  const decoded = decodeDraft(raw);
  const pending =
    decoded && raw !== ownRaw && raw !== dismissedRaw && draftDiffers(decoded.values, baseline)
      ? decoded
      : null;

  return {
    pending,
    restore: () => {
      if (raw) setDismissedRaw(raw);
      return pending?.values ?? null;
    },
    discard: () => {
      if (raw) setDismissedRaw(raw);
      removeDraft(key);
      setOwnRaw(null);
    },
    clear: () => {
      touched.current = false;
      removeDraft(key);
      setOwnRaw(null);
    },
  };
}
