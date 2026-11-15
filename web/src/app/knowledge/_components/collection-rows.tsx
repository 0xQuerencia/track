"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createCollectionAction, deleteCollectionAction, updateCollectionAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { ConfirmButton } from "@/components/track/confirm-button";
import type { CollectionRow } from "@/lib/knowledge/queries";
import { hrefWith } from "@/lib/knowledge/params";

function Notice({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </ActionNotice>
  );
}

export function CollectionCreateForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCollectionAction, null);
  return (
    <section className="tk-panel kn-capture" aria-label="New collection">
      <form action={action} className="kn-capture-form">
        <label className="tk-field kn-capture-title">
          <span>New collection</span>
          <input name="name" required maxLength={80} placeholder="e.g. Reading list, Physics, Robotics" />
        </label>
        <label className="tk-field kn-capture-title">
          <span>Description (optional)</span>
          <input name="description" maxLength={500} />
        </label>
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Creating…" : "Create collection"}
        </button>
      </form>
      <Notice state={state} />
    </section>
  );
}

function CollectionEditForm({ collection, onDone }: { collection: CollectionRow; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateCollectionAction.bind(null, collection.id),
    null,
  );
  return (
    <form action={action} className="kn-edit-form" aria-label={`Edit collection ${collection.name}`}>
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Name</span>
          <input name="name" required maxLength={80} defaultValue={collection.name} />
        </label>
        <label className="tk-field">
          <span>Description</span>
          <input name="description" maxLength={500} defaultValue={collection.description ?? ""} />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="tk-button tk-ghost" onClick={onDone}>
          Close
        </button>
      </div>
      <Notice state={state} />
    </form>
  );
}

export function CollectionRowView({ collection }: { collection: CollectionRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<ActionState>(null);
  return (
    <li id={`collections-${collection.id}`} className="kn-row">
      <div className="kn-row-main">
        <Link href={hrefWith("/knowledge", { tab: "notes", collection: collection.id })} className="kn-row-title">
          {collection.name}
        </Link>
        {collection.description ? <p className="kn-row-excerpt">{collection.description}</p> : null}
        <div className="kn-row-meta">
          <span>{collection.note_count} {collection.note_count === 1 ? "note" : "notes"}</span>
          <span>{collection.bookmark_count} {collection.bookmark_count === 1 ? "bookmark" : "bookmarks"}</span>
        </div>
      </div>
      <div className="kn-row-actions">
        <button type="button" className="tk-button tk-ghost" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
          {editing ? "Close edit" : "Edit"}
        </button>
        <ConfirmButton
          label={`Delete collection ${collection.name.slice(0, 40)}`}
          confirmLabel="Confirm delete"
          onConfirm={async () => {
            setMessage(await deleteCollectionAction(collection.id));
            router.refresh();
          }}
        />
      </div>
      {editing ? <CollectionEditForm collection={collection} onDone={() => setEditing(false)} /> : null}
      {message && !message.ok ? (
        <ActionNotice tone="error" role="alert">
          {message.message}
        </ActionNotice>
      ) : null}
    </li>
  );
}
