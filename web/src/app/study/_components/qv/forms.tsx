"use client";

import { useActionState, useState, useTransition } from "react";
import { bulkImportAction, planItemAction, readNotificationsAction, replanAction, restoreAction, runJobAction, saveSettingsAction, type Msg } from "../../vault-actions";
import { DIFFICULTIES, SOURCES, type QvSettings } from "@/lib/qv/constants";
import type { ChapterChoice } from "./ui";

const Note = ({ state }: { state: Msg }) => (state ? <span role="status" className={state.ok ? "st-inline-note" : "st-inline-error"}>{state.message}</span> : null);

export function BulkImport({ chapters }: { chapters: ChapterChoice[] }) {
  const [state, action, pending] = useActionState<Msg, FormData>(bulkImportAction, null);
  return (
    <form action={action} className="tk-form">
      <label className="tk-field" data-wide="true">
        <span>Paste questions: numbered (1. 2. 3.), blank-line separated, or a JSON array</span>
        <textarea name="text" rows={6} required placeholder={'1. Find the limit of sin x / x as x → 0\n2. State Newton\'s second law'} />
      </label>
      <div className="tk-form-grid">
        <label className="tk-field"><span>Chapter for all</span><select name="chapterId" defaultValue=""><option value="">Unassigned</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="tk-field"><span>Source</span><select name="source" defaultValue="Other">{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="tk-field"><span>Difficulty</span><select name="difficulty" defaultValue="Medium">{DIFFICULTIES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <div className="tk-form-actions"><button className="tk-button" disabled={pending}>{pending ? "Importing…" : "Import"}</button><Note state={state} /></div>
    </form>
  );
}

export function RestoreForm() {
  const [state, action, pending] = useActionState<Msg, FormData>(restoreAction, null);
  return (
    <form action={action} className="tk-form">
      <label className="tk-field"><span>Backup file (.json)</span><input type="file" name="file" accept="application/json,.json" required /></label>
      <div className="tk-form-actions"><button className="tk-button" disabled={pending}>{pending ? "Restoring…" : "Restore"}</button><Note state={state} /></div>
    </form>
  );
}

export function SettingsForm({ s }: { s: QvSettings }) {
  const [state, action, pending] = useActionState<Msg, FormData>(saveSettingsAction, null);
  const n = (name: string, label: string, value: number, min: number, max: number) => (
    <label className="tk-field"><span>{label}</span><input name={name} type="number" min={min} max={max} defaultValue={value} required /></label>
  );
  const t = (name: string, label: string, value: string) => (
    <label className="tk-field"><span>{label}</span><input name={name} type="time" defaultValue={value} required /></label>
  );
  return (
    <form action={action} className="tk-form">
      <h3 className="st-subhead">Review intervals (days)</h3>
      <div className="tk-form-grid">
        {n("redDays", "Red", s.redDays, 1, 30)}{n("yellowDays", "Yellow", s.yellowDays, 1, 60)}{n("greenDays", "First green", s.greenDays, 1, 120)}
        <label className="tk-field"><span>Green ladder</span><input name="ladder" defaultValue={s.ladder.join(", ")} /></label>
        {n("maxIntervalDays", "Longest interval", s.maxIntervalDays, 7, 365)}{n("examWindowDays", "Exam window (days)", s.examWindowDays, 0, 365)}
        {n("maxDailyReviews", "Daily review cap", s.maxDailyReviews, 5, 300)}
      </div>
      <h3 className="st-subhead">Availability</h3>
      <div className="tk-form-grid">
        {n("weekdayMinutes", "Weekday study minutes", s.weekdayMinutes, 0, 960)}{n("weekendMinutes", "Weekend study minutes", s.weekendMinutes, 0, 960)}
        {n("minutesPerQuestion", "Minutes per question", s.minutesPerQuestion, 1, 30)}{t("dayStart", "Day starts", s.dayStart)}{t("dayEnd", "Day ends", s.dayEnd)}
      </div>
      <h3 className="st-subhead">Background jobs</h3>
      <div className="tk-form-grid">
        {t("planTime", "Daily plan", s.planTime)}{t("reminderTime", "Revision reminder", s.reminderTime)}{t("eveningTime", "Evening check", s.eveningTime)}
        {t("weeklyTime", "Weekly review", s.weeklyTime)}
        <label className="tk-field"><span>Weekly review day</span><select name="weeklyDay" defaultValue={s.weeklyDay}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
        <label className="tk-field"><span>Time zone</span><input name="timezone" defaultValue={s.timezone} /></label>
        <label className="qv-check"><input type="checkbox" name="jobsEnabled" defaultChecked={s.jobsEnabled} /> Jobs enabled</label>
      </div>
      <div className="tk-form-actions"><button className="tk-button tk-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button><Note state={state} /></div>
    </form>
  );
}

export function JobButton({ name, label }: { name: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span className="st-actions">
      <button type="button" className="tk-button tk-ghost" disabled={pending} onClick={() => start(async () => setMsg(await runJobAction(name)))} aria-label={`Run ${label} now`}>{pending ? "Running…" : "Run now"}</button>
      <Note state={msg} />
    </span>
  );
}

export function ReplanButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span className="st-actions">
      <button type="button" className="tk-button" disabled={pending} onClick={() => start(async () => setMsg(await replanAction()))}>{pending ? "Planning…" : "Rebuild plan"}</button>
      <Note state={msg} />
    </span>
  );
}

export function PlanItemButtons({ id, locked, status }: { id: number; locked: boolean; status: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="st-actions">
      {status !== "deferred" ? (
        <button type="button" className="tk-button tk-ghost" disabled={pending} aria-pressed={locked} onClick={() => start(async () => void (await planItemAction(id, { locked: !locked })))}>{locked ? "Unlock" : "Lock"}</button>
      ) : null}
      {status === "planned" ? <button type="button" className="tk-button tk-ghost" disabled={pending} onClick={() => start(async () => void (await planItemAction(id, { status: "done" })))}>Mark done</button> : null}
      {status === "done" ? <button type="button" className="tk-button tk-ghost" disabled={pending} onClick={() => start(async () => void (await planItemAction(id, { status: "planned" })))}>Reopen</button> : null}
    </span>
  );
}

export function MarkRead() {
  const [pending, start] = useTransition();
  return <button type="button" className="tk-button tk-ghost" disabled={pending} onClick={() => start(async () => void (await readNotificationsAction()))}>Mark all read</button>;
}
