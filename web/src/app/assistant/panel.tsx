import Link from "next/link";
import { getAiStatus, getConsent } from "@/lib/ai";
import { buildBrief } from "@/lib/assistant/brief";
import { nowLabel } from "@/lib/assistant/context";
import { getAutoApply, messagesForDay } from "@/lib/assistant/store";
import { getDb } from "@/lib/db";
import { setAssistantConsentAction, setAutoApplyAction } from "./actions";
import { AssistantChat } from "./chat";
import "@/styles/assistant.css";

/** Daily brief first, then the conversation. Shared by the Command Center and /assistant. */
export function AssistantPanel() {
  const db = getDb();
  const { date } = nowLabel();
  const brief = buildBrief(db, date);
  const status = getAiStatus(db);
  const consent = getConsent(db, "assistant").enabled;
  const ready = status.keyConfigured && !status.killSwitch;

  return (
    <div className="asst">
      <section className="asst-brief" aria-label="Daily brief">
        <h3>Your brief</h3>
        {brief.length === 0 ? <p className="tk-empty-small">Nothing scheduled and nothing overdue. A clear day.</p> : (
          <div className="asst-brief-grid">
            {brief.map((section) => (
              <div key={section.title}>
                <p className="tk-kicker">{section.title}</p>
                <ul>{section.lines.map((line) => <li key={line.text}>{line.href ? <Link href={line.href}>{line.text}</Link> : line.text}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </section>
      {!ready ? (
        <p className="tk-empty">The assistant needs the OpenRouter key on the server and AI not disabled. The brief above works without it.</p>
      ) : !consent ? (
        <form action={setAssistantConsentAction} className="asst-consent">
          <p>Talk to your app in plain language. The AI reads what you type plus short titles of your open tasks, upcoming events, habits and goals (so it can refer to real items), sent to OpenRouter. It can add and edit records; deletes always ask first, and every change has an Undo.</p>
          <label><input type="checkbox" name="enabled" /> I allow this</label>
          <button className="tk-button tk-primary" type="submit">Turn on</button>
        </form>
      ) : (
        <>
          <AssistantChat messages={messagesForDay(db, date)} />
          <form action={setAutoApplyAction} className="asst-auto">
            <label><input type="checkbox" name="auto" defaultChecked={getAutoApply(db)} /> Apply adds and edits right away (deletes always ask)</label>
            <button className="tk-button tk-ghost" type="submit">Save</button>
          </form>
        </>
      )}
    </div>
  );
}
