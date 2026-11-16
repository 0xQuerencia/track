"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteNoteAction, saveNoteAction, setNotePinnedAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { ConfirmButton } from "@/components/track/confirm-button";
import { DraftNotice } from "@/components/track/draft-notice";
import { MarkdownEditor } from "@/components/track/markdown";
import { NOTE_KINDS } from "@/lib/entities-ext/ideas-knowledge";
import { draftKey, useDraftRecovery } from "@/lib/knowledge/drafts";

export type NoteFormValues = {
  title: string;
  kind: string;
  collection_id: string;
  tags: string;
  body: string;
};

/** Note editor with draft recovery. Pinning is a separate control, see NoteToolbar. */
export function NoteEditor({
  id,
  initial,
  pinned,
  collections,
}: {
  id: number;
  initial: NoteFormValues;
  pinned: boolean;
  collections: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<NoteFormValues>(initial);
  const [message, setMessage] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const draft = useDraftRecovery(draftKey("notes", id), values, initial);

  const set = (field: keyof NoteFormValues) => (value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }));

  return (
    <form
      className="kn-editor"
      aria-label="Edit note"
      onSubmit={(event) => {
        event.preventDefault();
        const submitted = values;
        startTransition(async () => {
          const result = await saveNoteAction(id, { ...submitted, pinned });
          setMessage(result);
          if (result?.ok) {
            draft.clear();
            router.refresh();
          }
        });
      }}
    >
      {draft.pending ? (
        <DraftNotice
          savedAt={draft.pending.savedAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) setValues(restored as NoteFormValues);
          }}
          onDiscard={draft.discard}
        />
      ) : null}
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Title</span>
          <input name="title" required maxLength={200} value={values.title} onChange={(e) => set("title")(e.target.value)} />
        </label>
        <label className="tk-field">
          <span>Kind</span>
          <select name="kind" value={values.kind} onChange={(e) => set("kind")(e.target.value)}>
            {NOTE_KINDS.map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Collection</span>
          <select name="collection_id" value={values.collection_id} onChange={(e) => set("collection_id")(e.target.value)}>
            <option value="">Unfiled</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Tags</span>
          <input name="tags" maxLength={2000} value={values.tags} placeholder="comma, separated" onChange={(e) => set("tags")(e.target.value)} />
        </label>
      </div>
      <MarkdownEditor
        name="body"
        label="Body"
        rows={18}
        value={values.body}
        onChange={set("body")}
        hint="Markdown. Refer to another note with [[Its title]] or [[note:ID]]; the link appears under Backlinks on that note."
      />
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </button>
        {message ? (
          <ActionNotice tone={message.ok ? "info" : "error"} role={message.ok ? "status" : "alert"}>
            {message.message}
          </ActionNotice>
        ) : null}
      </div>
    </form>
  );
}

/** Pin and delete for one note. Delete returns to the notes list. */
export function NoteToolbar({ id, title, pinned }: { id: number; title: string; pinned: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="kn-toolbar" role="toolbar" aria-label="Note actions">
      <button
        type="button"
        className="tk-button tk-ghost"
        aria-pressed={pinned}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setNotePinnedAction(id, !pinned);
            router.refresh();
          })
        }
      >
        {pinned ? "Unpin" : "Pin"}
      </button>
      <ConfirmButton
        label={`Delete note ${title.slice(0, 40)}`}
        confirmLabel="Confirm delete"
        onConfirm={() => deleteNoteAction(id)}
      />
    </div>
  );
}
