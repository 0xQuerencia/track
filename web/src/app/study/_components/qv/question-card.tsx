"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteQuestionAction, updateQuestionAction, type Msg } from "../../vault-actions";
import { DIFFICULTIES, EXAM_CATEGORIES, MISTAKE_CATEGORIES, QUESTION_TYPES, SOURCES } from "@/lib/qv/constants";
import type { Attempt, Question } from "@/lib/qv/store";
import { GradeBar } from "./grade-bar";
import { StateBadge, when, type ChapterChoice } from "./ui";

type Props = { question: Question; imageIds: number[]; attempts: Attempt[]; chapters: ChapterChoice[]; today: string; notebook?: boolean };

export function QuestionCard({ question: q, imageIds, attempts, chapters, today, notebook }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [state, action, pending] = useActionState<Msg, FormData>(updateQuestionAction, null);
  const [, startDelete] = useTransition();
  const snippet = q.text.replace(/\s+/g, " ").slice(0, 140) || "(screenshot only)";

  return (
    <article className="qv-card" id={`qv-${q.id}`} data-state={q.state}>
      <header className="qv-card-head">
        <StateBadge state={q.state} />
        <button type="button" className="qv-card-title" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {snippet}
        </button>
        <span className="qv-meta">{when(q.next_review, today)}</span>
      </header>
      <p className="qv-meta-line">
        {[q.subject, q.chapter_name, q.topic, q.source, q.qtype, q.difficulty].filter(Boolean).join(" · ")}
        {q.tags ? ` · ${q.tags}` : ""} · {q.attempts} attempt{q.attempts === 1 ? "" : "s"}, {q.successes} independent
        {q.mistake_category ? ` · ${q.mistake_category}` : ""}
      </p>
      {notebook && q.notes ? <p className="qv-own">Your note: {q.notes}</p> : null}
      <GradeBar questionId={q.id} compact={!open} />
      {open ? (
        <div className="qv-detail">
          {imageIds.length ? (
            <div className="qv-images">
              {imageIds.map((id) => (
                <a key={id} href={`/api/study/image/${id}`} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/study/image/${id}`} alt={`Screenshot for question ${q.id}`} loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}
          {q.text ? <pre className="qv-text">{q.text}</pre> : null}
          {q.correct_answer || q.solution ? (
            <div>
              <button type="button" className="tk-button tk-ghost" onClick={() => setReveal((r) => !r)}>
                {reveal ? "Hide" : "Show"} answer and solution
              </button>
              {reveal ? (
                <div className="qv-solution">
                  {q.correct_answer ? <p><strong>Answer:</strong> {q.correct_answer}</p> : null}
                  {q.solution ? <pre className="qv-text">{q.solution}</pre> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="st-inline-note">No answer or solution saved. Add yours when you have it.</p>
          )}
          {q.notes && !notebook ? <p className="qv-own">Your note: {q.notes}</p> : null}
          <div className="qv-hist">
            <h4 className="st-subhead">Attempt history</h4>
            {attempts.length ? (
              <ul>
                {attempts.map((a) => (
                  <li key={a.id} data-voided={a.voided || undefined}>
                    {a.date} · {a.rating}
                    {a.hint_used ? " (hint)" : ""}
                    {a.mistake_category ? ` · ${a.mistake_category}` : ""} · next {a.next_review}
                    {a.voided ? " · undone" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="st-inline-note">Not attempted yet.</p>
            )}
          </div>
          <div className="st-actions">
            <button type="button" className="tk-button" onClick={() => setEditing((e) => !e)}>
              {editing ? "Close editor" : "Edit"}
            </button>
            <button
              type="button"
              className="tk-button tk-ghost"
              onClick={() => {
                if (window.confirm("Delete this question, its screenshots and its history?")) startDelete(async () => void (await deleteQuestionAction(q.id)));
              }}
            >
              Delete
            </button>
          </div>
          {editing ? (
            <form action={action} className="tk-form qv-edit">
              <input type="hidden" name="id" value={q.id} />
              <div className="tk-form-grid">
                <label className="tk-field" data-wide="true"><span>Question</span><textarea name="text" rows={4} defaultValue={q.text} maxLength={8000} /></label>
                <label className="tk-field"><span>Chapter</span>
                  <select name="chapterId" defaultValue={q.chapter_id ?? ""}>
                    <option value="">Unassigned</option>
                    {chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select></label>
                <label className="tk-field"><span>Topic</span><input name="topic" defaultValue={q.topic ?? ""} maxLength={120} /></label>
                <label className="tk-field"><span>Subtopic</span><input name="subtopic" defaultValue={q.subtopic ?? ""} maxLength={120} /></label>
                <label className="tk-field"><span>Type</span><select name="qtype" defaultValue={q.qtype}>{QUESTION_TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="tk-field"><span>Difficulty</span><select name="difficulty" defaultValue={q.difficulty}>{DIFFICULTIES.map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="tk-field"><span>Source</span><select name="source" defaultValue={q.source}>{SOURCES.map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="tk-field"><span>Exam</span><select name="examCategory" defaultValue={q.exam_category}>{EXAM_CATEGORIES.map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="tk-field"><span>Importance (1-5)</span><input name="importance" type="number" min={1} max={5} defaultValue={q.importance} /></label>
                <label className="tk-field"><span>Tags (comma separated)</span><input name="tags" defaultValue={q.tags ?? ""} /></label>
                <label className="tk-field"><span>Mistake type</span>
                  <select name="mistakeCategory" defaultValue={q.mistake_category ?? ""}><option value="">None</option>{MISTAKE_CATEGORIES.map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="tk-field"><span>Correct answer</span><input name="correctAnswer" defaultValue={q.correct_answer ?? ""} maxLength={1000} /></label>
                <label className="tk-field" data-wide="true"><span>Solution / corrected solution</span><textarea name="solution" rows={4} defaultValue={q.solution ?? ""} maxLength={8000} /></label>
                <label className="tk-field" data-wide="true"><span>My notes and approach</span><textarea name="notes" rows={3} defaultValue={q.notes ?? ""} maxLength={4000} /></label>
              </div>
              <div className="tk-form-actions">
                <button className="tk-button tk-primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
                {state ? <span role="status" className={state.ok ? "st-inline-note" : "st-inline-error"}>{state.message}</span> : null}
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
