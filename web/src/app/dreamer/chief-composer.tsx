"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendChiefMessageAction, type ChiefFormState } from "./collective-actions";

export function ChiefComposer() {
  const [state, submit, pending] = useActionState<ChiefFormState,FormData>(sendChiefMessageAction,null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(()=>{if (state?.ok) form.current?.reset();},[state]);
  return (
    <form action={submit} ref={form} className="dreamer-chief-compose">
      <label htmlFor="chief-prompt" className="tk-kicker">Ask Chief</label>
      <textarea id="chief-prompt" name="objective" minLength={3} maxLength={2200} required rows={3}
        placeholder="Find a useful idea from my notes, challenge it and produce a realistic plan..."
        onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>
      <div className="dreamer-chief-compose-footer">
        <label className="dreamer-chief-opt"><input type="checkbox" name="include_context"/> Include redacted Track insights, goals, projects and session titles in this request</label>
        <button className="tk-button" type="submit" disabled={pending}>{pending?"Chief is working…":"Send to Chief"}</button>
      </div>
      <small>Only Chief replies here. Specialist work is stored under each mission. AI calls require Dreamer consent. Nothing is published, executed or sent to other accounts.</small>
      {state&&!state.ok?<p role="alert" className="dreamer-notice">{state.message}</p>:null}
    </form>
  );
}

