"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveIdeaAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { DraftNotice } from "@/components/track/draft-notice";
import { MarkdownEditor } from "@/components/track/markdown";
import { IDEA_CATEGORIES, IDEA_PRIORITIES, IDEA_STATUSES } from "@/lib/entities-ext/ideas-knowledge";
import { draftKey, useDraftRecovery, type DraftValues } from "@/lib/knowledge/drafts";
import type { IdeaFormValues } from "@/lib/ideas/values";

/**
 * The idea's editable fields. Typing autosaves a local draft; a draft that
 * differs from the saved idea is offered back on the next visit. The key on
 * the parent remounts this form whenever the saved idea changes.
 */
export function IdeaEditor({ id, initial }: { id: number; initial: IdeaFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<IdeaFormValues>(initial);
  const [message, setMessage] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const draft = useDraftRecovery(draftKey("ideas", id), values as DraftValues, initial as DraftValues);

  const set = (field: keyof IdeaFormValues) => (value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }));

  return (
    <form
      className="id-editor"
      aria-label="Edit idea"
      onSubmit={(event) => {
        event.preventDefault();
        const submitted = values;
        startTransition(async () => {
          const result = await saveIdeaAction(id, submitted);
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
            if (restored) setValues(restored as IdeaFormValues);
          }}
          onDiscard={draft.discard}
        />
      ) : null}

      <div className="tk-form-grid id-editor-grid">
        <label className="tk-field">
          <span>Title</span>
          <input name="title" required maxLength={200} value={values.title} onChange={(e) => set("title")(e.target.value)} />
        </label>
        <label className="tk-field">
          <span>Category</span>
          <select name="category" value={values.category} onChange={(e) => set("category")(e.target.value)}>
            {IDEA_CATEGORIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Status</span>
          <select name="status" value={values.status} onChange={(e) => set("status")(e.target.value)}>
            {IDEA_STATUSES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Priority</span>
          <select name="priority" value={values.priority} onChange={(e) => set("priority")(e.target.value)}>
            {IDEA_PRIORITIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="tk-field id-wide">
          <span>Tags</span>
          <input name="tags" value={values.tags} maxLength={2000} placeholder="comma, separated" onChange={(e) => set("tags")(e.target.value)} />
        </label>
      </div>

      <div className="id-wide">
        <MarkdownEditor
          name="body"
          label="Body"
          rows={14}
          value={values.body}
          onChange={set("body")}
          hint="Markdown: # headings, **bold**, lists, - [ ] tasks, [links](https://…). Use [[Note title]] to refer to a note."
        />
      </div>

      <div className="tk-form-grid id-editor-grid">
        <label className="tk-field id-wide">
          <span>Research links (one web address per line)</span>
          <textarea name="research_links" rows={4} value={values.research_links} onChange={(e) => set("research_links")(e.target.value)} />
        </label>
        <label className="tk-field id-wide">
          <span>Attachments (references only, one per line)</span>
          <textarea name="attachments" rows={3} value={values.attachments} onChange={(e) => set("attachments")(e.target.value)} placeholder="e.g. sketch-v2.pdf, on the NAS" />
        </label>
        <label className="tk-field id-wide">
          <span>Notes</span>
          <textarea name="notes" rows={3} value={values.notes} onChange={(e) => set("notes")(e.target.value)} />
        </label>
      </div>

      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Save idea"}
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
