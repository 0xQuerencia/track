"use client";

import { useActionState } from "react";
import { applyCheckinAction, proposeCheckinAction, type CheckinState } from "./actions";

export function CheckinForm({ questions }: { questions: readonly string[] }) {
  const [state, propose, proposing] = useActionState<CheckinState, FormData>(proposeCheckinAction, null);
  const [applied, apply, applying] = useActionState<CheckinState, FormData>(applyCheckinAction, null);
  const result = applied ?? state;

  if (applied?.phase === "done") return <p className="checkin-done" role="status">{applied.message}</p>;

  if (state?.phase === "preview" && !applied) {
    return (
      <form action={apply} className="checkin-preview">
        <p className="tk-kicker">Here is what I will log. Nothing is saved yet.</p>
        <ul>{state.lines.map((line) => <li key={line}>{line}</li>)}</ul>
        <input type="hidden" name="id" value={state.id} />
        <div className="tk-form-actions">
          <button className="tk-button tk-primary" type="submit" name="intent" value="apply" disabled={applying}>Save these</button>
          <button className="tk-button tk-ghost" type="submit" name="intent" value="discard" disabled={applying}>Discard</button>
        </div>
      </form>
    );
  }

  return (
    <form action={propose} className="checkin-form">
      <ul className="checkin-questions">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
      <label className="tk-field">
        <span>Tell me in your own words</span>
        <textarea name="text" rows={3} maxLength={1500} required placeholder="Slept 9 PM to 7 AM, energy 4, weight 72.5 kg, did a 30 min walk" />
      </label>
      <div className="tk-form-actions">
        <button className="tk-button tk-primary" type="submit" disabled={proposing}>{proposing ? "Reading…" : "Review"}</button>
        {result?.phase === "error" ? <span role="alert" className="checkin-error">{result.message}</span> : null}
      </div>
    </form>
  );
}
