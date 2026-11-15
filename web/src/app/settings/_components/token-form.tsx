"use client";

import { useActionState, useId, useState } from "react";
import { ActionNotice } from "@/components/motion/action-notice";
import { INTEGRATION_SCOPES, type IntegrationScope } from "@/lib/security/integration-tokens";
import { createIntegrationTokenAction, type TokenActionState } from "../actions";

const SCOPE_TEXT: Record<IntegrationScope, string> = {
  "sessions:write": "Send session metadata (connector sessions push)",
  "projects:write": "Send project inventory (connector inventory push)",
  "metadata:write": "Heartbeat only (connector ping)",
  "dreamer:run": "Run the local Dreamer daily cycle (scheduled trigger)",
  "study:jobs": "Run the due Study jobs (plan, reminders, weekly review) from a scheduler",
};

/** Creates a token and shows it once, with a copy button. Closing the page loses it for good. */
export function TokenForm() {
  const [state, action, pending] = useActionState<TokenActionState, FormData>(
    createIntegrationTokenAction,
    null,
  );
  const labelId = useId();
  const [copied, setCopied] = useState(false);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="set-token-form">
      <form action={action} className="set-form">
        <label className="tk-field" htmlFor={labelId}>
          <span>Label (where it will be used)</span>
          <input id={labelId} name="label" type="text" maxLength={80} required placeholder="Linux laptop" disabled={pending} />
        </label>
        <fieldset className="set-scopes">
          <legend>Scopes</legend>
          {INTEGRATION_SCOPES.map((scope) => (
            <label key={scope} className="set-scope">
              <input type="checkbox" name="scope" value={scope} defaultChecked={scope !== "projects:write" && scope !== "dreamer:run" && scope !== "study:jobs"} disabled={pending} />
              <span>
                <code>{scope}</code> {SCOPE_TEXT[scope]}
              </span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Creating…" : "Create token"}
        </button>
      </form>

      {state ? (
        <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </ActionNotice>
      ) : null}

      {state?.ok && state.token ? (
        <div className="set-once" role="region" aria-label="New token">
          <p>
            Token for <strong>{state.label}</strong>. {state.scopes.includes("dreamer:run")
              ? <>Store it in a restricted environment file for the scheduled <code>POST /api/dreamer/run</code> job. It is not stored here, so it cannot be shown again.</>
              : <>Put it in the <code>TRACK_CONNECTOR_TOKEN</code> environment variable on that machine. It is not stored here, so it cannot be shown again.</>}
          </p>
          <code className="set-token" data-testid="new-token">{state.token}</code>
          <button type="button" className="tk-button" onClick={() => copy(state.token as string)}>
            Copy token
          </button>
          <span role="status" aria-live="polite" className="set-hint">{copied ? "Copied." : ""}</span>
        </div>
      ) : null}
    </div>
  );
}
