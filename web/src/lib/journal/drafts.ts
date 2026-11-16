/*
 * Unsent journal drafts, kept in this browser only (localStorage). Storage can
 * be missing, full or blocked, so every access is guarded and failures are
 * silent: the form still works without a draft. Drafts never leave the device.
 */

export type JournalFields = {
  date: string;
  title: string;
  mood: string;
  energy: string;
  win: string;
  setback: string;
  tags: string;
  text: string;
};

export const DRAFT_KEY = "track.journal.draft.v1";
const CHANGE_EVENT = "track:journal-draft";
const FIELD_LIMITS: Record<keyof JournalFields, number> = {
  date: 10,
  title: 200,
  mood: 1,
  energy: 1,
  win: 2000,
  setback: 2000,
  tags: 2000,
  text: 100_000,
};

export const EMPTY_FIELDS = (date: string): JournalFields => ({
  date,
  title: "",
  mood: "",
  energy: "",
  win: "",
  setback: "",
  tags: "",
  text: "",
});

/** Reads a stored draft string. Anything that is not a well-formed draft is ignored. */
export function parseDraft(raw: string | null): Partial<JournalFields> | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const draft: Partial<JournalFields> = {};
  for (const key of Object.keys(FIELD_LIMITS) as (keyof JournalFields)[]) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === "string") draft[key] = field.slice(0, FIELD_LIMITS[key]);
  }
  return Object.keys(draft).length > 0 ? draft : null;
}

export function readDraftRaw(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

/** Saves the draft and tells listeners in this tab. Returns false if the browser refused. */
export function writeDraft(fields: Partial<JournalFields>): boolean {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(fields));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable: there is nothing stored to clear.
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // No window (server render): nothing to notify.
  }
}

/** Subscribes to draft changes in this tab and in other tabs. */
export function subscribeDraft(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
