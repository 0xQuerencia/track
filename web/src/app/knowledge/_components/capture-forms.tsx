"use client";

import { useActionState } from "react";
import { createBookmarkAction, createNoteAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { NOTE_KINDS } from "@/lib/entities-ext/ideas-knowledge";

type Collections = { id: number; name: string }[];

function Notice({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </ActionNotice>
  );
}

function CollectionSelect({ collections }: { collections: Collections }) {
  return (
    <label className="tk-field">
      <span>Collection</span>
      <select name="collection_id" defaultValue="">
        <option value="">Unfiled</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Quick note: title, kind and collection. Creating it opens the note to write the body. */
export function NoteQuickCapture({ collections, autoFocus }: { collections: Collections; autoFocus: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createNoteAction, null);
  return (
    <section className="tk-panel kn-capture" aria-label="New note">
      <form action={action} className="kn-capture-form">
        <label className="tk-field kn-capture-title">
          <span>New note</span>
          <input name="title" required maxLength={200} autoFocus={autoFocus} placeholder="A title, then write the body" />
        </label>
        <label className="tk-field">
          <span>Kind</span>
          <select name="kind" defaultValue="Note">
            {NOTE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <CollectionSelect collections={collections} />
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Creating…" : "Create and open"}
        </button>
      </form>
      <Notice state={state} />
    </section>
  );
}

/** Quick bookmark: only a web address is required. Nothing is fetched from it. */
export function BookmarkQuickCapture({ collections }: { collections: Collections }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createBookmarkAction, null);
  return (
    <section className="tk-panel kn-capture" aria-label="Save a bookmark">
      <form action={action} className="kn-capture-form">
        <label className="tk-field kn-capture-title">
          <span>Bookmark a web address</span>
          <input name="url" type="url" required maxLength={2000} placeholder="https://" />
        </label>
        <label className="tk-field">
          <span>Title (optional)</span>
          <input name="title" maxLength={200} />
        </label>
        <label className="tk-field">
          <span>Tags</span>
          <input name="tags" maxLength={2000} placeholder="comma, separated" />
        </label>
        <CollectionSelect collections={collections} />
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Save bookmark"}
        </button>
      </form>
      <Notice state={state} />
    </section>
  );
}
