"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBookmarkAction, setBookmarkPinnedAction, updateBookmarkAction, type ActionState } from "../actions";
import { ConfirmButton } from "@/components/track/confirm-button";
import { ActionNotice } from "@/components/motion/action-notice";
import type { BookmarkRow } from "@/lib/knowledge/queries";
import { urlLabel } from "@/lib/knowledge/urls";

type Collections = { id: number; name: string }[];

function BookmarkEditForm({
  bookmark,
  collections,
  onDone,
}: {
  bookmark: BookmarkRow;
  collections: Collections;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateBookmarkAction.bind(null, bookmark.id),
    null,
  );
  return (
    <form action={action} className="kn-edit-form" aria-label={`Edit bookmark ${bookmark.title ?? bookmark.url}`}>
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Address</span>
          <input name="url" type="url" required maxLength={2000} defaultValue={bookmark.url} />
        </label>
        <label className="tk-field">
          <span>Title</span>
          <input name="title" maxLength={200} defaultValue={bookmark.title ?? ""} />
        </label>
        <label className="tk-field">
          <span>Tags</span>
          <input name="tags" maxLength={2000} defaultValue={bookmark.tags ?? ""} />
        </label>
        <label className="tk-field">
          <span>Collection</span>
          <select name="collection_id" defaultValue={bookmark.collection_id ?? ""}>
            <option value="">Unfiled</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field id-wide">
          <span>Description</span>
          <textarea name="description" rows={2} maxLength={500} defaultValue={bookmark.description ?? ""} />
        </label>
      </div>
      <input type="hidden" name="pinned" value={bookmark.pinned ? "on" : ""} />
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="tk-button tk-ghost" onClick={onDone}>
          Close
        </button>
        {state ? (
          <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
            {state.message}
          </ActionNotice>
        ) : null}
      </div>
    </form>
  );
}

export function BookmarkRowView({ bookmark, collections }: { bookmark: BookmarkRow; collections: Collections }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionState>(null);
  const label = bookmark.title ?? urlLabel(bookmark.url);

  return (
    <li id={`bookmarks-${bookmark.id}`} className="kn-row kn-bookmark" data-pinned={bookmark.pinned === 1 || undefined}>
      <div className="kn-row-main">
        <a href={bookmark.url} target="_blank" rel="noopener noreferrer nofollow" className="kn-row-title">
          {label}
        </a>
        <span className="kn-row-sub">{urlLabel(bookmark.url)}</span>
        {bookmark.description ? <p className="kn-row-excerpt">{bookmark.description}</p> : null}
        <div className="kn-row-meta">
          {bookmark.collection_name ? <span>{bookmark.collection_name}</span> : <span>Unfiled</span>}
          {bookmark.tags ? <span>{bookmark.tags}</span> : null}
          {bookmark.pinned === 1 ? <span className="kn-mark">Pinned</span> : null}
        </div>
      </div>
      <div className="kn-row-actions">
        <button
          type="button"
          className="tk-button tk-ghost"
          aria-pressed={bookmark.pinned === 1}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMessage(await setBookmarkPinnedAction(bookmark.id, bookmark.pinned !== 1));
              router.refresh();
            })
          }
        >
          {bookmark.pinned === 1 ? "Unpin" : "Pin"}
        </button>
        <button type="button" className="tk-button tk-ghost" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
          {editing ? "Close edit" : "Edit"}
        </button>
        <ConfirmButton
          label={`Delete bookmark ${label.slice(0, 40)}`}
          confirmLabel="Confirm delete"
          onConfirm={async () => {
            const result = await deleteBookmarkAction(bookmark.id);
            setMessage(result);
            router.refresh();
          }}
        />
      </div>
      {editing ? <BookmarkEditForm bookmark={bookmark} collections={collections} onDone={() => setEditing(false)} /> : null}
      {message && !message.ok ? (
        <ActionNotice tone="error" role="alert">
          {message.message}
        </ActionNotice>
      ) : null}
    </li>
  );
}
