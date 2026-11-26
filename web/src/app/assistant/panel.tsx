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
  const activeJobs = Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_jobs WHERE state IN ('queued','running')").get()?.n);
  const approvals = Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_action_drafts WHERE state='pending' AND expires_ms>unixepoch('subsec')*1000").get()?.n);

  return (
    <div className="asst">
      <section className="asst-brief" aria-label="Daily brief">
        <header className="asst-brief-head">
          <h3>Today&rsquo;s brief</h3>
          <span>{new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
        </header>
        {brief.length === 0 ? <p className="tk-empty-small">Nothing scheduled and nothing overdue. A clear day.</p> : (
          <div className="asst-brief-grid">
            {brief.map((section) => (
              <div key={section.title} className="asst-brief-card" data-kind={section.title.toLowerCase().replaceAll(" ", "-")}>
                <p className="asst-brief-label">{section.title}</p>
                <ul>{section.lines.map((line) => <li key={line.text}>{line.href ? <Link href={line.href}>{line.text}</Link> : line.text}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="asst-brief" aria-label="Delegate work">
        <header className="asst-brief-head"><h3>Delegate work</h3></header>
        <div className="asst-work-links">
          <Link className="tk-button tk-ghost" href="/dreamer/missions#github-ci">Check GitHub Actions</Link>
          <Link className="tk-button tk-ghost" href="/dreamer/missions">Mission Control ({activeJobs} active)</Link>
          <Link className="tk-button tk-ghost" href="/dreamer/inbox">Approvals ({approvals} pending)</Link>
        </div>
      </section>
      {!ready ? (
        <p className="tk-empty">The assistant needs the AI provider key on the server and AI not disabled. The brief above works without it.</p>
      ) : !consent ? (
        <form action={setAssistantConsentAction} className="asst-consent">
          <p>Talk to your app in plain language. The AI reads what you type plus short titles of your open tasks, upcoming events, habits and goals (so it can refer to real items), sent to your AI provider. It can add and edit records; deletes always ask first, and every change has an Undo.</p>
          <label><input type="checkbox" name="enabled" /> I allow this</label>
          <button className="tk-button tk-primary" type="submit">Turn on</button>
        </form>
      ) : (
        <>
          <AssistantChat messages={messagesForDay(db, date)} />
          <form action={setAutoApplyAction} className="asst-auto">
            <label><input type="checkbox" name="auto" defaultChecked={getAutoApply(db)} /> Apply adds and edits right away (deletes always ask)</label>
            <button className="asst-btn" type="submit">Save</button>
          </form>
        </>
      )}
    </div>
  );
}
