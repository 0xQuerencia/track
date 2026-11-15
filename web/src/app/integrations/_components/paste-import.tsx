"use client";

import { useActionState, useId } from "react";
import { ActionNotice } from "@/components/motion/action-notice";
import { MAX_PASTE_CHARACTERS } from "@/lib/integrations/limits";
import {
  importRepoEventsPasteAction,
  importSessionsPasteAction,
  type IntegrationActionState,
} from "../actions";

type Kind = "sessions" | "repo-events";

const COPY: Record<Kind, { summary: string; hint: string; placeholder: string; action: typeof importSessionsPasteAction }> = {
  sessions: {
    summary: "Paste sessions JSON",
    hint: 'Format: {"version":1,"source":"manual","tool":"codex","sessions":[{"external_id":"...","title":"...","cwd_hint":"...","last_activity_at":"..."}]}. Metadata only; any extra key makes the whole paste fail.',
    placeholder: '{"version": 1, "source": "manual", "tool": "codex", "sessions": []}',
    action: importSessionsPasteAction,
  },
  "repo-events": {
    summary: "Paste repo events JSON",
    hint: 'Format: {"version":1,"project_external_id":"...","events":[{"kind":"pull_request","external_id":"...","title":"...","url":"https://...","state":"open"}]}. The project must have that external id.',
    placeholder: '{"version": 1, "project_external_id": "", "events": []}',
    action: importRepoEventsPasteAction,
  },
};

/** Collapsible paste box. The JSON is sent to the server and validated there; nothing is fetched. */
export function PasteImport({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  const [state, action, pending] = useActionState<IntegrationActionState, FormData>(copy.action, null);
  const fieldId = useId();
  return (
    <details className="int-paste">
      <summary>{copy.summary}</summary>
      <form action={action} className="int-form">
        <label className="tk-field" htmlFor={fieldId}>
          <span>JSON document (up to {MAX_PASTE_CHARACTERS.toLocaleString("en")} characters)</span>
          <textarea
            id={fieldId}
            name="payload"
            rows={8}
            required
            maxLength={MAX_PASTE_CHARACTERS}
            spellCheck={false}
            placeholder={copy.placeholder}
            disabled={pending}
          />
        </label>
        <p className="int-hint">{copy.hint}</p>
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </button>
        {state ? (
          <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
            {state.message}
          </ActionNotice>
        ) : null}
      </form>
    </details>
  );
}
