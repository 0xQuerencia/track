"use client";

import { useActionState } from "react";
import type { DocumentActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { DOCUMENT_CATEGORIES } from "@/lib/documents/constants";

export type DocumentDefaults = {
  title?: string;
  category?: string;
  tags?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  notes?: string | null;
};

type Action = (previous: DocumentActionState, formData: FormData) => Promise<DocumentActionState>;

/** Metadata form. Creating a document can also take a file; editing never changes the file here. */
export function DocumentForm({
  action,
  defaults = {},
  withFile = false,
  submitLabel,
}: {
  action: Action;
  defaults?: DocumentDefaults;
  withFile?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<DocumentActionState, FormData>(action, null);

  return (
    <form action={formAction} className="docs-form">
      <div className="docs-form-grid">
        <label className="docs-field" data-wide>
          <span>Title</span>
          <input name="title" required maxLength={2000} defaultValue={defaults.title ?? ""} />
        </label>
        <label className="docs-field">
          <span>Category</span>
          <select name="category" defaultValue={defaults.category ?? "Other"}>
            {DOCUMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="docs-field">
          <span>Tags</span>
          <input name="tags" maxLength={2000} placeholder="comma, separated" defaultValue={defaults.tags ?? ""} />
        </label>
        <label className="docs-field">
          <span>Issued on</span>
          <input name="issued_on" type="date" defaultValue={defaults.issued_on ?? ""} />
        </label>
        <label className="docs-field">
          <span>Expires on</span>
          <input name="expires_on" type="date" defaultValue={defaults.expires_on ?? ""} />
        </label>
        <label className="docs-field" data-wide>
          <span>Notes</span>
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={defaults.notes ?? ""} />
        </label>
        {withFile ? (
          <label className="docs-field" data-wide>
            <span>File (optional, up to 10 MB)</span>
            <input
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx"
            />
            <small className="docs-muted">PDF, PNG, JPG, WebP, TXT, Markdown or DOCX. Stored privately and sent only to you.</small>
          </label>
        ) : null}
      </div>
      <div className="docs-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
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
