"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  applyAssistantActionAction,
  rejectAssistantActionAction,
  sendAssistantAction,
  undoAssistantActionAction,
  type ChatState,
} from "./actions";

type Action = { id: number; status: string; summary: string | null; href: string | null; error: string | null; describe: string };
type Message = { id: number; role: "user" | "assistant"; text: string; actions: Action[] };

const SUGGESTIONS = [
  "Plan my day: physics revision, gym at 6 PM, call mom",
  "Slept 10 PM to 6:30, energy 4, weight 72 kg",
  "What should I focus on first?",
];

function ActionRow({ action }: { action: Action }) {
  if (action.status === "pending")
    return (
      <li className="asst-action" data-status="pending">
        <span>{action.describe}</span>
        <form action={applyAssistantActionAction}><input type="hidden" name="id" value={action.id} /><button className="tk-button tk-primary" type="submit">Do it</button></form>
        <form action={rejectAssistantActionAction}><input type="hidden" name="id" value={action.id} /><button className="tk-button tk-ghost" type="submit">Skip</button></form>
      </li>
    );
  if (action.status === "applied")
    return (
      <li className="asst-action" data-status="applied">
        <span>{action.href ? <Link href={action.href}>{action.summary}</Link> : action.summary}</span>
        <form action={undoAssistantActionAction}><input type="hidden" name="id" value={action.id} /><button className="tk-button tk-ghost" type="submit">Undo</button></form>
      </li>
    );
  return (
    <li className="asst-action" data-status={action.status}>
      <span>{action.status === "failed" ? `Could not do it: ${action.error ?? "failed"}` : action.status === "undone" ? `Undone: ${action.summary}` : `Skipped: ${action.describe}`}</span>
    </li>
  );
}

export function AssistantChat({ messages }: { messages: Message[] }) {
  const [state, send, pending] = useActionState<ChatState, FormData>(sendAssistantAction, null);
  const form = useRef<HTMLFormElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages.length]);

  return (
    <div className="asst-chat">
      <div className="asst-log" ref={log} aria-live="polite">
        <p className="asst-msg" data-role="assistant">What are you about to do today? Tell me in your own words and I will set it up: tasks, events, logs, whatever you need.</p>
        {messages.map((m) => (
          <div key={m.id} className="asst-turn" data-role={m.role}>
            <p className="asst-msg" data-role={m.role}>{m.text}</p>
            {m.actions.length ? <ul className="asst-actions">{m.actions.map((a) => <ActionRow key={a.id} action={a} />)}</ul> : null}
          </div>
        ))}
        {pending ? <p className="asst-msg asst-thinking" data-role="assistant">Working on it…</p> : null}
      </div>
      {messages.length === 0 ? (
        <div className="asst-suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="tk-button tk-ghost" onClick={() => { const t = form.current?.elements.namedItem("text") as HTMLTextAreaElement | null; if (t) { t.value = s; t.focus(); } }}>{s}</button>
          ))}
        </div>
      ) : null}
      <form action={send} ref={form} className="asst-form">
        <textarea
          name="text" rows={2} maxLength={1500} required
          placeholder="e.g. I have physics revision till 4, then gym at 6, remind me to call mom tomorrow"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        />
        <button className="tk-button tk-primary" type="submit" disabled={pending}>{pending ? "…" : "Send"}</button>
      </form>
      {state && !state.ok ? <p role="alert" className="asst-error">{state.message}</p> : null}
    </div>
  );
}
