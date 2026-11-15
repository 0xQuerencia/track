"use client";

import { useState, useTransition } from "react";
import { setFieldAction } from "@/app/actions";

/** Edits a chapter's notes. Saves through the generic field action, which validates the value. */
export function NotesForm({ chapterId, notes }: { chapterId: number; notes: string | null }) {
  const [value, setValue] = useState(notes ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="st-notes-form"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setFieldAction("chapters", chapterId, "notes", value);
          setMessage(result?.message ?? null);
        });
      }}
    >
      <label className="tk-field" data-wide="true">
        <span>Notes</span>
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </button>
        {message ? <span role="status" className="st-inline-note">{message}</span> : null}
      </div>
    </form>
  );
}
