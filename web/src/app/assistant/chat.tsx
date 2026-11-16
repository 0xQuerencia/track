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

const BADGE: Record<string, string> = { applied: "Done", pending: "Needs your OK", failed: "Failed", undone: "Undone", rejected: "Skipped" };

function ChangeRow({ action }: { action: Action }) {
  const text =
    action.status === "applied" ? (action.href ? <Link href={action.href}>{action.summary}</Link> : action.summary)
    : action.status === "failed" ? `${action.describe}: ${action.error ?? "could not be done"}`
    : action.status === "undone" ? action.summary
    : action.describe;
  return (
    <li className="asst-change" data-status={action.status}>
      <span className="asst-badge">{BADGE[action.status] ?? action.status}</span>
      <span className="asst-change-text">{text}</span>
      <span className="asst-change-actions">
        {action.status === "pending" ? (
          <>
            <form action={applyAssistantActionAction}><input type="hidden" name="id" value={action.id} /><button className="asst-btn asst-btn-primary" type="submit">Do it</button></form>
            <form action={rejectAssistantActionAction}><input type="hidden" name="id" value={action.id} /><button className="asst-btn" type="submit">Skip</button></form>
          </>
        ) : null}
        {action.status === "applied" ? (
          <form action={undoAssistantActionAction}><input type="hidden" name="id" value={action.id} /><button className="asst-btn" type="submit">Undo</button></form>
        ) : null}
      </span>
    </li>
  );
}

export function AssistantChat({ messages }: { messages: Message[] }) {
  const [state, send, pending] = useActionState<ChatState, FormData>(sendAssistantAction, null);
  const form = useRef<HTMLFormElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages.length, pending]);

  const fill = (text: string) => {
    const field = form.current?.elements.namedItem("text") as HTMLTextAreaElement | null;
    if (field) { field.value = text; field.focus(); }
  };

  return (
    <section className="asst-chat" aria-label="Assistant chat">
      <header className="asst-greet">
        <h4>What are you about to do today?</h4>
        <p>Tell me in your own words. I will add the tasks, events and logs for you, and you can undo anything.</p>
      </header>

      {messages.length > 0 || pending ? (
        <div className="asst-log" ref={log} aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className="asst-turn" data-role={m.role}>
              <p className="asst-bubble">{m.text}</p>
              {m.actions.length ? <ul className="asst-changes" aria-label="Changes">{m.actions.map((a) => <ChangeRow key={a.id} action={a} />)}</ul> : null}
            </div>
          ))}
          {pending ? <div className="asst-turn" data-role="assistant"><p className="asst-bubble asst-thinking">Thinking<span aria-hidden="true">…</span></p></div> : null}
        </div>
      ) : (
        <div className="asst-suggest">
          {SUGGESTIONS.map((s) => <button key={s} type="button" className="asst-chip" onClick={() => fill(s)}>{s}</button>)}
        </div>
      )}

      <form action={send} ref={form} className="asst-composer">
        <textarea
          name="text" rows={2} maxLength={1500} required
          placeholder="e.g. Physics revision till 4, gym at 6 PM, remind me to call mom tomorrow"
          aria-label="Message to the assistant"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        />
        <button className="tk-button tk-primary" type="submit" disabled={pending}>{pending ? "…" : "Send"}</button>
      </form>
      <p className="asst-hint">Enter to send · Shift+Enter for a new line</p>
      {state && !state.ok ? <p role="alert" className="asst-error">{state.message}</p> : null}
    </section>
  );
}
