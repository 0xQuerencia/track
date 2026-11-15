"use client";

import { useActionState } from "react";
import { ActionNotice } from "@/components/motion/action-notice";
import type { AiConsent } from "@/lib/ai/types";
import { setAiConsentAction, type AiConsentActionState } from "../ai-actions";

export function AiConsentForm({ consent }: { consent: AiConsent }) {
  const [state, action, pending] = useActionState<AiConsentActionState, FormData>(
    setAiConsentAction,
    null,
  );

  return (
    <form action={action} className="set-ai-form">
      <input type="hidden" name="feature" value="dreamer" />
      <fieldset disabled={pending}>
        <legend>Dreamer permission</legend>
        <label className="set-ai-option">
          <input type="checkbox" name="enabled" defaultChecked={consent.enabled} />
          <span>Allow Dreamer to send minimized, redacted excerpts to your AI provider</span>
        </label>
        <label className="set-ai-option">
          <input
            type="checkbox"
            name="allowDailyCycle"
            defaultChecked={consent.scope.allowDailyCycle}
          />
          <span>Allow the daily cycle without asking me to confirm each run</span>
        </label>
        <label className="tk-field set-ai-limit">
          <span>Maximum characters per excerpt</span>
          <input
            type="number"
            name="maxExcerptChars"
            min={40}
            max={2_000}
            step={1}
            defaultValue={consent.scope.maxExcerptChars}
          />
        </label>
        <p className="set-ai-note">
          Saved permission: <strong>{consent.enabled ? "On" : "Off"}</strong>
        </p>
        <button type="submit" className="tk-button tk-primary">
          {pending ? "Saving…" : "Save AI settings"}
        </button>
      </fieldset>
      {state ? (
        <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </ActionNotice>
      ) : null}
    </form>
  );
}
