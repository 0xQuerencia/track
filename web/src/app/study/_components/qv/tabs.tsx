import Link from "next/link";
import { Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { getAiStatus } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { MISTAKE_CATEGORIES, MODES, MODE_LABEL, SOURCES, type QState } from "@/lib/qv/constants";
import { plainMath } from "@/lib/qv/math";
import { imageIdsFor } from "@/lib/qv/images";
import { insights, mistakePatterns, repeatOffenders, weeklySummary } from "@/lib/qv/insights";
import { jobStatus } from "@/lib/qv/jobs";
import { planItems, refreshPlanDone } from "@/lib/qv/plan";
import { getSettings } from "@/lib/qv/settings";
import { activityByDay, chapterRows, mistakesByCategory, overview, retentionTrend, studyMinutesBySubject, subjectMastery, upcomingExams, workloadAhead } from "@/lib/qv/stats";
import { attemptsFor, listQuestions, today as qvToday, type Question } from "@/lib/qv/store";
import { startPracticeAction } from "../../vault-actions";
import { firstParam, type StudySearch } from "../params";
import { ActivityGrid, Bars, HBars, Meter, StackBar } from "./charts";
import { Capture } from "./capture";
import { BulkImport, JobButton, MarkRead, PlanItemButtons, ReplanButton, RestoreForm, SettingsForm } from "./forms";
import { QuestionCard } from "./question-card";
import { StateBadge, when, type ChapterChoice } from "./ui";

const PAGE_SIZE = 25;

function chapterChoices(): ChapterChoice[] {
  return (getDb().prepare("SELECT id, name, subject FROM chapters ORDER BY klass DESC, subject, id").all() as { id: number; name: string; subject: string }[]).map((c) => ({ id: c.id, label: `${c.name} (${c.subject})`, subject: c.subject }));
}

function Cards({ rows, chapters, today, notebook }: { rows: Question[]; chapters: ChapterChoice[]; today: string; notebook?: boolean }) {
  const db = getDb();
  return (
    <div className="qv-list">
      {rows.map((q) => (
        <QuestionCard key={q.id} question={q} imageIds={imageIdsFor(q.id, db)} attempts={attemptsFor(q.id, db)} chapters={chapters} today={today} notebook={notebook} />
      ))}
    </div>
  );
}

/** Start a practice session from any mode. Plain forms: no client code needed. */
function PracticeLauncher({ chapters, defaults }: { chapters: ChapterChoice[]; defaults?: { mode?: string } }) {
  return (
    <form action={startPracticeAction} className="tk-form qv-launch">
      <div className="tk-form-grid">
        <label className="tk-field"><span>Mode</span><select name="mode" defaultValue={defaults?.mode ?? "due"}>{MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select></label>
        <label className="tk-field"><span>Chapter (chapter mode)</span><select name="chapterId" defaultValue=""><option value="">—</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="tk-field"><span>Subject (subject mode)</span><select name="subject" defaultValue=""><option value="">—</option>{[...new Set(chapters.map((c) => c.subject))].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="tk-field"><span>Questions</span><input name="limit" type="number" min={1} max={100} defaultValue={20} /></label>
        <label className="tk-field"><span>Time limit, minutes (timed)</span><input name="timedMinutes" type="number" min={1} max={240} defaultValue={30} /></label>
      </div>
      <div className="tk-form-actions"><button className="tk-button tk-primary">Start practice</button></div>
    </form>
  );
}

export function QvSummary() {
  const db = getDb();
  const today = qvToday(db);
  const o = overview(db, today);
  const notes = db.prepare("SELECT id, title, body, href, created_at, read_at FROM qv_notifications ORDER BY id DESC LIMIT 5").all() as { id: number; title: string; body: string | null; href: string | null; read_at: string | null }[];
  const unread = notes.filter((n) => !n.read_at).length;
  const asks = insights(db, today);
  return (
    <Panel title="Question vault" description="What to revise now, from your graded questions.">
      <StatGrid>
        <StatCard label="Due today" value={o.dueToday} />
        <StatCard label="Overdue" value={o.overdue} />
        <StatCard label="Red" value={o.red} />
        <StatCard label="Unassessed" value={o.unassessed} />
      </StatGrid>
      <div className="tk-form-actions">
        <form action={startPracticeAction}><input type="hidden" name="mode" value="due" /><button className="tk-button tk-primary" disabled={o.dueToday === 0}>Revise {o.dueToday} due</button></form>
        <Link className="tk-button" href="/study?tab=vault">Add questions</Link>
        <Link className="tk-button tk-ghost" href="/study?tab=plan">Today&apos;s plan</Link>
      </div>
      {notes.length ? (
        <div className="qv-notes">
          <h3 className="st-subhead">Notifications {unread ? `(${unread} new)` : ""}</h3>
          <ul>{notes.map((n) => <li key={n.id} data-unread={!n.read_at || undefined}><strong>{n.href ? <Link href={n.href}>{n.title}</Link> : n.title}</strong>{n.body ? <span> {n.body}</span> : null}</li>)}</ul>
          {unread ? <MarkRead /> : null}
        </div>
      ) : null}
      <h3 className="st-subhead">Ask your data</h3>
      <dl className="qv-asks">
        {asks.map((a) => (
          <div key={a.id}>
            <dt>{a.question}</dt>
            <dd>{a.href ? <Link href={a.href}>{a.answer}</Link> : a.answer}{a.evidence.length ? <small> {a.evidence.join(" ")}</small> : null}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function VaultTab({ search }: { search: StudySearch }) {
  const db = getDb();
  const today = qvToday(db);
  const chapters = chapterChoices();
  const aiStatus = getAiStatus(db);
  const page = Math.max(1, Number(firstParam(search, "vp")) || 1);
  const filter = { q: firstParam(search, "q"), state: firstParam(search, "state") || "all", subject: firstParam(search, "vsubject"), chapterId: Number(firstParam(search, "vchapter")) || undefined, source: firstParam(search, "vsource"), tag: firstParam(search, "tag") };
  const { rows, total } = listQuestions({ ...filter, today, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, db);
  const link = (p: number) => {
    const q = new URLSearchParams({ tab: "vault", vp: String(p) });
    for (const [k, v] of Object.entries({ q: filter.q, state: filter.state === "all" ? "" : filter.state, vsubject: filter.subject, vchapter: filter.chapterId ? String(filter.chapterId) : "", vsource: filter.source, tag: filter.tag })) if (v) q.set(k, v);
    return `/study?${q}`;
  };
  return (
    <>
      <Capture chapters={chapters} ai={{ configured: aiStatus.keyConfigured && !aiStatus.killSwitch, enabled: aiStatus.consents.some((c) => c.feature === "vault" && c.enabled) }} />
      <Panel title="Your questions" description={`${total} question${total === 1 ? "" : "s"}${filter.q || filter.state !== "all" ? " match" : ""}.`}>
        <form method="get" action="/study" className="st-filters">
          <input type="hidden" name="tab" value="vault" />
          <label className="tk-field"><span>Search</span><input name="q" defaultValue={filter.q} placeholder="text, topic, tag, note" /></label>
          <label className="tk-field"><span>State</span><select name="state" defaultValue={filter.state}><option value="all">All</option>{(["unassessed", "red", "yellow", "green"] as QState[]).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
          <label className="tk-field"><span>Chapter</span><select name="vchapter" defaultValue={filter.chapterId ?? ""}><option value="">Any</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label className="tk-field"><span>Source</span><select name="vsource" defaultValue={filter.source}><option value="">Any</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="tk-field"><span>Tag</span><input name="tag" defaultValue={filter.tag} /></label>
          <div className="tk-form-actions"><button className="tk-button">Filter</button><Link className="tk-button tk-ghost" href="/study?tab=vault">Clear</Link></div>
        </form>
        {rows.length ? <Cards rows={rows} chapters={chapters} today={today} /> : <p className="st-inline-note">{total === 0 && !filter.q && filter.state === "all" ? "No questions yet. Paste a screenshot with Ctrl+V above, or import a list below." : "No questions match these filters."}</p>}
        {total > PAGE_SIZE ? (
          <nav className="st-actions" aria-label="Pages">
            {page > 1 ? <Link className="tk-button" href={link(page - 1)}>Previous</Link> : null}
            <span className="st-inline-note">Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
            {page * PAGE_SIZE < total ? <Link className="tk-button" href={link(page + 1)}>Next</Link> : null}
          </nav>
        ) : null}
      </Panel>
      <SplitPanels>
        <Panel title="Bulk import" description="Many questions at once. They arrive Unassessed."><BulkImport chapters={chapters} /></Panel>
        <Panel title="Practice" description="Pick a mode and go."><PracticeLauncher chapters={chapters} /></Panel>
      </SplitPanels>
    </>
  );
}

export function ReviewTab() {
  const db = getDb();
  const today = qvToday(db);
  const chapters = chapterChoices();
  const o = overview(db, today);
  const { rows } = listQuestions({ due: true, today, limit: 50 }, db);
  const byChapter = new Map<string, Question[]>();
  for (const q of rows) byChapter.set(q.chapter_name ?? "No chapter", [...(byChapter.get(q.chapter_name ?? "No chapter") ?? []), q]);
  const ahead = workloadAhead(db, today, 14);
  return (
    <>
      <StatGrid>
        <StatCard label="Due today" value={o.dueToday} /><StatCard label="Overdue" value={o.overdue} /><StatCard label="Red" value={o.red} /><StatCard label="Yellow" value={o.yellow} />
      </StatGrid>
      <SplitPanels>
        <Panel title="Revision queue" description="Red first, then yellow, then green; oldest first.">
          {rows.length ? [...byChapter].map(([name, list]) => (
            <div key={name}>
              <h3 className="st-subhead">{name} ({list.length})</h3>
              <ul className="qv-queue">{list.map((q) => <li key={q.id}><StateBadge state={q.state} /> <span>{plainMath(q.text).replace(/\s+/g, " ").slice(0, 90) || "(screenshot)"}</span> <small>{when(q.next_review, today)}</small></li>)}</ul>
            </div>
          )) : <p className="st-inline-note">Nothing is due. Grade some questions and they will come back here on schedule.</p>}
        </Panel>
        <Panel title="Start revising" description="Keyboard: 1 red, 2 yellow, 3 green, Space reveal, N next."><PracticeLauncher chapters={chapters} /></Panel>
      </SplitPanels>
      <Panel title="Next 14 days" description="Reviews scheduled per day. Days over your daily cap are spread out by the nightly job."><Bars data={ahead.map((d) => ({ label: d.date.slice(8), value: d.due, note: d.date }))} empty="No reviews scheduled." /></Panel>
    </>
  );
}

export function NotebookTab() {
  const db = getDb();
  const today = qvToday(db);
  const chapters = chapterChoices();
  const { rows } = listQuestions({ state: "red", limit: 100 }, db);
  const yellow = listQuestions({ state: "yellow", limit: 100 }, db).rows;
  const patterns = mistakePatterns(db);
  const cats = mistakesByCategory(db);
  const repeats = repeatOffenders(db);
  return (
    <>
      <SplitPanels>
        <Panel title="Patterns" description="Only shown when the same kind of mistake has been recorded at least three times.">
          {patterns.length ? <ul className="qv-patterns">{patterns.map((p) => <li key={p.text}>{p.text}</li>)}</ul> : <p className="st-inline-note">No pattern yet. When you grade a question red or yellow, say what went wrong; patterns appear after three of the same kind.</p>}
        </Panel>
        <Panel title="Mistakes by type"><HBars data={cats.map((c) => ({ label: c.category, value: c.n }))} /></Panel>
      </SplitPanels>
      {repeats.length ? <Panel title="Keep failing" description="Red twice or lapsed twice.">
        <ul className="qv-queue">{repeats.map((q) => <li key={q.id}><a href={`#qvn-${q.id}`}>{plainMath(q.text).replace(/\s+/g, " ").slice(0, 100) || "(screenshot)"}</a> <small>red {q.reds}x, lapsed {q.lapses}x</small></li>)}</ul></Panel> : null}
      <Panel title={`Red (${rows.length})`} description="Could not solve alone. Add your own explanation and corrected solution when you understand it.">
        {rows.length ? <Cards rows={rows} chapters={chapters} today={today} notebook /> : <p className="st-inline-note">No red questions.</p>}
      </Panel>
      <Panel title={`Yellow (${yellow.length})`} description="Partly there.">
        {yellow.length ? <Cards rows={yellow} chapters={chapters} today={today} notebook /> : <p className="st-inline-note">No yellow questions.</p>}
      </Panel>
      <p className="st-inline-note">Mistake types: {MISTAKE_CATEGORIES.join(", ")}.</p>
    </>
  );
}

export function ChapterQuestionPanel() {
  const db = getDb();
  const rows = chapterRows(db).filter((c) => c.mastery.total > 0);
  return (
    <Panel title="Question mastery by chapter" description="From graded questions only. Lectures and checkpoints never raise it. A chapter needs 5 graded questions before it shows a percentage.">
      {rows.length ? (
        <div className="qv-heat" role="list">
          {rows.map((c) => (
            <a key={c.id} role="listitem" href={`/study?tab=chapters&chapter=${c.id}`} className="qv-heat-cell" data-level={c.mastery.mastery === null ? "none" : c.mastery.mastery >= 75 ? "high" : c.mastery.mastery >= 50 ? "mid" : "low"}>
              <strong>{c.name}</strong>
              <span>{c.mastery.mastery === null ? `${c.mastery.assessed}/${c.mastery.total} graded` : `${c.mastery.mastery}% mastery`}</span>
              <small>{c.mastery.red}R {c.mastery.yellow}Y {c.mastery.green}G · {c.mastery.unassessed} new{c.mastery.overdue ? ` · ${c.mastery.overdue} overdue` : ""}</small>
              <small>{c.lastPractised ? `Last ${c.lastPractised}` : "Never practised"}{c.nextReview ? ` · next ${c.nextReview}` : ""}{c.weakTopic ? ` · weak: ${c.weakTopic}` : ""}</small>
            </a>
          ))}
        </div>
      ) : <p className="st-inline-note">No chapter has questions yet.</p>}
    </Panel>
  );
}

export function AnalyticsTab() {
  const db = getDb();
  const today = qvToday(db);
  const o = overview(db, today);
  const chapters = chapterRows(db, today);
  const subjects = subjectMastery(chapters);
  const activity = activityByDay(db, today, 84);
  const week = activity.slice(-7);
  const days30 = activityByDay(db, today, 30);
  const retention = retentionTrend(db, today, 8);
  const w = weeklySummary(db, today);
  return (
    <>
      <SplitPanels>
        <Panel title="Red / yellow / green"><StackBar parts={[{ label: "Red", value: o.red, state: "red" }, { label: "Yellow", value: o.yellow, state: "yellow" }, { label: "Green", value: o.green, state: "green" }, { label: "Unassessed", value: o.unassessed, state: "unassessed" }]} /></Panel>
        <Panel title="Subject mastery" description="Weighted by graded questions.">
          {subjects.length ? subjects.map((s) => <Meter key={s.subject} label={s.subject} value={s.mastery} />) : <p className="st-inline-note">No chapters yet.</p>}
        </Panel>
      </SplitPanels>
      <Panel title="Last 7 days"><Bars data={week.map((d) => ({ label: d.date.slice(5), value: d.attempted }))} empty="No questions attempted in the last 7 days." /></Panel>
      <SplitPanels>
        <Panel title="Questions solved per day" description="Green attempts, last 30 days."><Bars data={days30.map((d) => ({ label: d.date.slice(8), value: d.solved }))} empty="No green attempts yet." /></Panel>
        <Panel title="Review retention" description="Of reviews of already-graded questions, the share that came out green. Needs 3 reviews in a week."><Bars data={retention.map((r) => ({ label: r.week.slice(5), value: r.retained }))} unit="%" empty="Not enough reviews yet." /></Panel>
      </SplitPanels>
      <SplitPanels>
        <Panel title="Mistakes by category"><HBars data={mistakesByCategory(db).map((c) => ({ label: c.category, value: c.n }))} /></Panel>
        <Panel title="Study time by subject" description="Minutes, last 30 days."><HBars data={studyMinutesBySubject(db, today).map((s) => ({ label: s.subject, value: s.minutes }))} unit=" min" /></Panel>
      </SplitPanels>
      <Panel title="Activity, last 12 weeks"><ActivityGrid days={activity} /></Panel>
      <Panel title="Upcoming exams">
        {upcomingExams(db, today).length ? <ul className="qv-queue">{upcomingExams(db, today).map((e) => <li key={e.name + e.date}><strong>{e.name}</strong> {e.date} <small>{e.days} day{e.days === 1 ? "" : "s"}</small></li>)}</ul> : <p className="st-inline-note">No exam is scheduled. Add one on the Exams tab.</p>}
      </Panel>
      <Panel title="This week" description={`${w.from} to ${w.to}`}>
        {w.attempts ? (
          <>
            <p>{w.attempts} attempts: {w.green} green, {w.yellow} yellow, {w.red} red ({w.accuracyPct}% green). {w.newlyGreen} newly green.</p>
            {w.priorities.length ? <ul className="qv-patterns">{w.priorities.map((p) => <li key={p}>{p}</li>)}</ul> : null}
          </>
        ) : <p className="st-inline-note">No questions attempted this week.</p>}
      </Panel>
    </>
  );
}

export function PlanTab() {
  const db = getDb();
  const today = qvToday(db);
  refreshPlanDone(today, db);
  const items = planItems(today, db);
  const planned = items.filter((i) => i.status !== "deferred");
  const deferred = items.filter((i) => i.status === "deferred");
  const total = planned.reduce((s, i) => s + i.minutes, 0);
  const s = getSettings(db);
  return (
    <>
      <Panel title="Today's study plan" description={`${total} min planned of about ${new Date(`${today}T00:00:00Z`).getUTCDay() % 6 === 0 ? s.weekendMinutes : s.weekdayMinutes} available. Calendar events are never overlapped; locked blocks stay put when the plan is rebuilt.`}>
        <div className="tk-form-actions"><ReplanButton /></div>
        {planned.length ? (
          <ol className="qv-plan">
            {planned.map((i) => (
              <li key={i.id} data-status={i.status}>
                <time>{i.start_time}–{i.end_time}</time>
                <div>
                  <strong>{i.title}</strong>
                  <small>{i.detail ?? ""}{i.reason ? ` · ${i.reason}` : ""}{i.locked ? " · locked" : ""}{i.status === "done" ? " · done" : ""}</small>
                  {i.question_ids ? <Link href="/study?tab=review" className="qv-link">Open revision queue</Link> : null}
                </div>
                <PlanItemButtons id={i.id} locked={Boolean(i.locked)} status={i.status} />
              </li>
            ))}
          </ol>
        ) : <p className="st-inline-note">Nothing planned. Add questions, set an exam or add study tasks, then rebuild.</p>}
      </Panel>
      {deferred.length ? (
        <Panel title="Deferred" description="Did not fit today. Each says why; they are first in line tomorrow.">
          <ul className="qv-queue">{deferred.map((i) => <li key={i.id}><strong>{i.title}</strong> <small>{i.minutes} min · {i.reason}</small></li>)}</ul>
        </Panel>
      ) : null}
    </>
  );
}

export function SettingsTab() {
  const db = getDb();
  const s = getSettings(db);
  const jobs = jobStatus(db);
  const runs = db.prepare("SELECT job, run_key, status, started_at, finished_at, error FROM qv_job_runs ORDER BY id DESC LIMIT 12").all() as { job: string; run_key: string; status: string; started_at: string; finished_at: string | null; error: string | null }[];
  return (
    <>
      <Panel title="Background jobs" description={`Run inside the server every minute and recorded in the database, so a restart or a missed time catches up once. ${s.jobsEnabled ? "" : "Jobs are switched off."}`}>
        <table className="tk-table"><thead><tr><th>Job</th><th>Schedule</th><th>Last run</th><th>State</th><th /></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j.name}>
              <td>{j.label}</td><td>{j.schedule}</td>
              <td>{j.lastRun ? `${j.lastRun.status} · ${(j.lastRun.at ?? "").slice(0, 16).replace("T", " ")} UTC${j.lastRun.error ? ` · ${j.lastRun.error}` : ""}` : "Never"}</td>
              <td>{j.nextDue}</td><td><JobButton name={j.name} label={j.label} /></td>
            </tr>))}</tbody></table>
        {runs.length ? <details><summary>Recent runs</summary><ul className="qv-queue">{runs.map((r) => <li key={r.job + r.run_key + r.started_at}>{r.job} · {r.run_key} · {r.status}{r.error ? ` · ${r.error}` : ""}</li>)}</ul></details> : null}
      </Panel>
      <Panel title="Scheduling and availability"><SettingsForm s={s} /></Panel>
      <SplitPanels>
        <Panel title="Backup" description="Questions, screenshots, OCR text and every attempt, as one JSON file."><a className="tk-button" href="/api/study/export" download>Download backup</a></Panel>
        <Panel title="Restore" description="Adds what is missing. Restoring the same file twice changes nothing."><RestoreForm /></Panel>
      </SplitPanels>
    </>
  );
}
