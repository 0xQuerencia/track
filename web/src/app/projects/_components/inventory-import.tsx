"use client";

import { useActionState, useState } from "react";
import { importInventoryAction, type ImportActionState } from "../actions";
import { MAX_INVENTORY_BYTES } from "@/lib/projects/import-schema";
import { FormSubmit } from "./form-submit";
import { StatusLine } from "./fields";

/** Reads an inventory file in the browser and posts its text to the import action. Nothing touches the disk on the server. */
export function InventoryImport() {
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, action] = useActionState<ImportActionState, FormData>(importInventoryAction, null);

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_INVENTORY_BYTES) {
      setText("");
      setFileError("That file is larger than 2 MB.");
      return;
    }
    setText(await file.text());
  };

  return (
    <div className="pj-import">
      <p className="pj-note">
        Version 1 JSON with a <code>projects</code> list. Matching uses <code>external_id</code>, then the git remote,
        then an exact name that belongs to one project. Manual descriptions, tags, categories and status are never
        overwritten.
      </p>
      <form action={action} className="tk-form" aria-label="Import inventory">
        <label className="tk-field" data-wide>
          <span>Inventory file</span>
          <input type="file" accept="application/json,.json" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
        {fileError ? <p className="pj-status" role="alert" data-tone="error">{fileError}</p> : null}
        <label className="tk-field" data-wide>
          <span>Or paste the JSON</span>
          <textarea
            name="payload"
            rows={6}
            className="pj-mono"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="tk-form-actions">
          <FormSubmit label="Import inventory" pendingLabel="Importing…" />
        </div>
      </form>
      <StatusLine state={state} />
      {state?.report && state.report.errors.length > 0 ? (
        <ul className="pj-issues" aria-label="Import problems">
          {state.report.errors.slice(0, 20).map((issue, index) => (
            <li key={`${issue.index}-${index}`}>
              {issue.index >= 0 ? `Entry ${issue.index + 1}` : "File"}
              {issue.external_id ? ` (${issue.external_id})` : ""}: {issue.message}
            </li>
          ))}
          {state.report.errors.length > 20 ? <li>…and {state.report.errors.length - 20} more.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
