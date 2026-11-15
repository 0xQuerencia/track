"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { finishPracticeAction, gradeAction, progressAction, setMistakeAction, undoAction } from "../vault-actions";
import { MISTAKE_CATEGORIES, RATINGS, STATE_LABEL, type QState, type Rating } from "@/lib/qv/constants";
import { MathText } from "@/components/track/math-text";
import { StateBadge } from "../_components/qv/ui";
import { ratingIcon } from "../_components/qv/ui";

export type RunnerQuestion = { id: number; text: string; chapter: string | null; topic: string | null; state: QState; difficulty: string; source: string; images: number[]; answer: string | null; solution: string | null; hint: string | null };
type Done = { rating: Rating; attemptId: number; nextReview: string; interval: number; downgraded: boolean };
type Summary = { answered: number; red: number; yellow: number; green: number; minutes: number; accuracyPct: number | null };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Runner({ sessionId, modeLabel, questions, startIndex, startSeconds, limitSeconds }: { sessionId: number; modeLabel: string; questions: RunnerQuestion[]; startIndex: number; startSeconds: number; limitSeconds: number | null }) {
  const [index, setIndex] = useState(startIndex);
  const [total, setTotal] = useState(startSeconds);
  const [perQ, setPerQ] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [counts, setCounts] = useState<Record<Rating, number>>({ red: 0, yellow: 0, green: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [finishing, setFinishing] = useState(false);
  const totalRef = useRef(startSeconds);
  const finishRef = useRef<() => void>(() => undefined);

  const q = questions[index];
  const answered = counts.red + counts.yellow + counts.green;

  // One clock per second; the page being hidden pauses it.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      totalRef.current += 1;
      setTotal(totalRef.current);
      setPerQ((t) => t + 1);
      if (limitSeconds !== null && totalRef.current >= limitSeconds) finishRef.current();
    }, 1000);
    return () => window.clearInterval(id);
  }, [limitSeconds]);

  // Progress is saved every 15 seconds and on every move, so closing the tab loses nothing.
  useEffect(() => {
    const id = window.setInterval(() => void progressAction(sessionId, index, totalRef.current), 15_000);
    return () => window.clearInterval(id);
  }, [sessionId, index]);

  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    await progressAction(sessionId, index, totalRef.current);
    setSummary(await finishPracticeAction(sessionId));
  }, [finishing, index, sessionId]);

  useEffect(() => {
    finishRef.current = () => void finish();
  }, [finish]);

  const next = useCallback(() => {
    if (index + 1 >= questions.length) {
      void finish();
      return;
    }
    const i = index + 1;
    setIndex(i);
    setDone(null);
    setShowHint(false);
    setShowSolution(false);
    setPerQ(0);
    setError(null);
    void progressAction(sessionId, i, totalRef.current);
  }, [finish, index, questions.length, sessionId]);

  const grade = useCallback(
    async (rating: Rating) => {
      if (!q || done || busy) return;
      setBusy(true);
      const res = await gradeAction(q.id, rating, { seconds: perQ, hintUsed: showHint, sessionId });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setError(null);
      setDone({ rating: res.result.rating, attemptId: res.result.attemptId, nextReview: res.result.nextReview, interval: res.result.interval, downgraded: res.result.downgraded });
      setCounts((c) => ({ ...c, [res.result.rating]: c[res.result.rating] + 1 }));
      setShowSolution(true);
    },
    [busy, done, perQ, q, sessionId, showHint],
  );

  const undo = useCallback(async () => {
    if (!done) return;
    await undoAction(done.attemptId);
    setCounts((c) => ({ ...c, [done.rating]: Math.max(0, c[done.rating] - 1) }));
    setDone(null);
  }, [done]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, textarea, select, button[aria-haspopup]")) return;
      if (e.key === "1") void grade("red");
      else if (e.key === "2") void grade("yellow");
      else if (e.key === "3") void grade("green");
      else if (e.key === " ") {
        e.preventDefault();
        setShowSolution((s) => !s);
      } else if (e.key.toLowerCase() === "n") next();
      else if (e.key.toLowerCase() === "u") void undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade, next, undo]);

  if (summary || !q) {
    const s = summary;
    return (
      <div className="qv-run-done">
        <h1>{finishing || s ? "Session finished" : "Nothing to practise"}</h1>
        {s ? <p>{s.answered} answered · {s.green} green, {s.yellow} yellow, {s.red} red{s.accuracyPct !== null ? ` · ${s.accuracyPct}% green` : ""} · {s.minutes} min. Logged to your study sessions and chapter revisions.</p> : <p>Wrapping up…</p>}
        <Link className="tk-button tk-primary" href="/study?tab=review">Back to Study</Link>
      </div>
    );
  }

  const left = limitSeconds !== null ? Math.max(0, limitSeconds - total) : null;
  return (
    <div className="qv-run">
      <header className="qv-run-bar">
        <span><strong>{modeLabel}</strong> · {index + 1} of {questions.length} · {questions.length - index - (done ? 1 : 0)} left</span>
        <span aria-label="Time">{left !== null ? `${clock(left)} left` : `${clock(total)} total`} · this question {clock(perQ)}</span>
        <span>{answered ? `${Math.round((100 * counts.green) / answered)}% green (${counts.green}/${answered})` : "No answers yet"}</span>
        <button type="button" className="tk-button tk-ghost" onClick={() => void finish()}>End session</button>
      </header>
      <div className="qv-run-progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index}><i style={{ width: `${(index / questions.length) * 100}%` }} /></div>

      <article className="qv-run-card">
        <p className="qv-meta-line"><StateBadge state={q.state} /> {[q.chapter, q.topic, q.source, q.difficulty].filter(Boolean).join(" · ")}</p>
        {q.images.map((id) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={id} className="qv-run-img" src={`/api/study/image/${id}`} alt="Question screenshot" />
        ))}
        {q.text ? <MathText className="qv-run-text" text={q.text} /> : null}

        <div className="qv-reveal">
          {q.hint && !showHint && !done ? <button type="button" className="tk-button tk-ghost" onClick={() => setShowHint(true)}>Show my hint (counts as a hint)</button> : null}
          <button type="button" className="tk-button tk-ghost" onClick={() => setShowSolution((s) => !s)}>{showSolution ? "Hide" : "Reveal"} solution <kbd>Space</kbd></button>
        </div>
        {showHint && q.hint ? <p className="qv-own">Your note: {q.hint}</p> : null}
        {showSolution ? (
          <div className="qv-solution">
            {q.answer ? <p><strong>Answer:</strong> {q.answer}</p> : null}
            {q.solution ? <MathText className="qv-text qv-math" text={q.solution} /> : null}
            {!q.answer && !q.solution ? <p className="st-inline-note">No answer or solution saved for this question.</p> : null}
          </div>
        ) : null}
      </article>

      <div className="qv-run-grade" role="group" aria-label="Grade">
        {RATINGS.map((r, i) => {
          const Icon = ratingIcon[r];
          return (
            <button key={r} type="button" className="qv-rate qv-rate-big" data-rating={r} disabled={busy || Boolean(done)} onClick={() => void grade(r)}>
              <Icon size={16} aria-hidden="true" /> {STATE_LABEL[r]} <kbd>{i + 1}</kbd>
            </button>
          );
        })}
      </div>
      <div role="status" aria-live="polite" className="qv-run-result">
        {error ? <p className="st-inline-error">{error}</p> : null}
        {done ? (
          <>
            <p>Marked {STATE_LABEL[done.rating]}{done.downgraded ? " (you used a hint)" : ""}. Next review {done.nextReview} ({done.interval} day{done.interval === 1 ? "" : "s"}).</p>
            {done.rating !== "green" ? (
              <label className="qv-inline">What went wrong?
                <select defaultValue="" onChange={(e) => void setMistakeAction(done.attemptId, e.target.value)}>
                  <option value="">Skip</option>{MISTAKE_CATEGORIES.map((m) => <option key={m}>{m}</option>)}
                </select></label>
            ) : null}
            <div className="st-actions">
              <button type="button" className="tk-button tk-primary" onClick={next}>{index + 1 >= questions.length ? "Finish" : "Next"} <kbd>N</kbd></button>
              <button type="button" className="tk-button tk-ghost" onClick={() => void undo()}>Undo <kbd>U</kbd></button>
            </div>
          </>
        ) : (
          <button type="button" className="tk-button tk-ghost" onClick={next}>Skip without grading <kbd>N</kbd></button>
        )}
      </div>
    </div>
  );
}
