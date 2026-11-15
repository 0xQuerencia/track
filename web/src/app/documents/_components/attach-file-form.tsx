"use client";

import { useActionState } from "react";
import type { DocumentActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";

type Action = (previous: DocumentActionState, formData: FormData) => Promise<DocumentActionState>;

/** Adds a file to a document that has none, or replaces its current file. */
export function AttachFileForm({
  action,
  hasFile,
}: {
  action: Action;
  hasFile: boolean;
}) {
  const [state, formAction, pending] = useActionState<DocumentActionState, FormData>(action, null);
  return (
    <form action={formAction} className="docs-form docs-attach">
      <label className="docs-field">
        <span>{hasFile ? "Replace the file" : "Attach a file"}</span>
        <input
          name="file"
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx"
        />
      </label>
      <div className="docs-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Uploading…" : hasFile ? "Replace file" : "Attach file"}
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
