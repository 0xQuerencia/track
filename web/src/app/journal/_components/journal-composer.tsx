"use client";

import { useMemo, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { MarkdownEditor } from "@/components/track/markdown";
import {
  clearDraft,
  EMPTY_FIELDS,
  parseDraft,
  readDraftRaw,
  subscribeDraft,
  writeDraft,
  type JournalFields,
} from "@/lib/journal/drafts";
import { saveJournalAction, updateJournalAction, type JournalActionState } from "../actions";

type Props =
  | { mode: "create"; defaultDate: string; tagHints: string[] }
  | { mode: "edit"; id: number; initial: JournalFields; defaultDate: string; tagHints: string[] };

const SCORES = ["1", "2", "3", "4", "5"] as const;

/**
 * Writing form for new and existing entries. A new entry keeps an unsent draft
 * in this browser, so a closed tab does not lose the text. Editing does not use drafts.
 */
export function JournalComposer(props: Props) {
  const { mode, defaultDate, tagHints } = props;
  const storedRaw = useSyncExternalStore(subscribeDraft, readDraftRaw, () => null);
  const stored = useMemo(() => (mode === "create" ? parseDraft(storedRaw) : null), [mode, storedRaw]);
  const [edits, setEdits] = useState<Partial<JournalFields>>({});
  const [message, setMessage] = useState<JournalActionState>(null);
  const [pending, startTransition] = useTransition();

  const base: JournalFields =
    props.mode === "edit"
      ? { ...EMPTY_FIELDS(defaultDate), ...props.initial }
      : { ...EMPTY_FIELDS(defaultDate), ...stored };
  const fields: JournalFields = { ...base, ...edits };
  const restored = mode === "create" && stored !== null && Object.keys(edits).length === 0;

  const update = (key: keyof JournalFields, value: string) => {
    setEdits((previous) => ({ ...previous, [key]: value }));
    if (mode === "create") writeDraft({ ...fields, [key]: value });
  };

  const discard = () => {
    clearDraft();
    setEdits({});
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await saveJournalAction(fields)
          : await updateJournalAction(props.id, fields);
      setMessage(result);
      if (result?.ok && mode === "create") {
        clearDraft();
        setEdits({});
      }
    });
  };

  const field = (key: keyof JournalFields) => ({
    value: fields[key],
    onChange: (event: { target: { value: string } }) => update(key, event.target.value),
  });

  return (
    <form
      onSubmit={submit}
      className="tk-form journal-composer"
      aria-label={mode === "create" ? "New journal entry" : "Edit journal entry"}
    >
      {restored ? (
        <p className="journal-draft-note" role="status">
          Restored an unsaved draft from this browser.{" "}
          <button type="button" className="tk-button tk-ghost" onClick={discard}>
            Discard draft
          </button>
        </p>
      ) : null}
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Date</span>
          <input type="date" name="date" required {...field("date")} />
        </label>
        <label className="tk-field">
          <span>Title</span>
          <input type="text" name="title" maxLength={200} placeholder="Optional" {...field("title")} />
        </label>
        <label className="tk-field">
          <span>Mood (1-5)</span>
          <select name="mood" {...field("mood")}>
            <option value="">Not set</option>
            {SCORES.map((score) => (
              <option key={score} value={score}>
                {score}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Energy (1-5)</span>
          <select name="energy" {...field("energy")}>
            <option value="">Not set</option>
            {SCORES.map((score) => (
              <option key={score} value={score}>
                {score}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field" data-wide="true">
          <span>A win</span>
          <input type="text" name="win" maxLength={2000} {...field("win")} />
        </label>
        <label className="tk-field" data-wide="true">
          <span>A setback</span>
          <input type="text" name="setback" maxLength={2000} {...field("setback")} />
        </label>
        <label className="tk-field" data-wide="true">
          <span>Tags</span>
          <input
            type="text"
            name="tags"
            list="journal-tag-hints"
            placeholder="comma, separated"
            maxLength={2000}
            {...field("tags")}
          />
        </label>
      </div>
      <datalist id="journal-tag-hints">
        {tagHints.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <MarkdownEditor
        name="text"
        label="Reflection"
        value={fields.text}
        onChange={(value) => update("text", value)}
        rows={10}
        maxLength={100_000}
        hint="Markdown works here. Keep it to yourself: nothing is shared or logged."
      />
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Save entry" : "Save changes"}
        </button>
        {message ? (
          <p role={message.ok ? "status" : "alert"} className="journal-form-note">
            {message.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
