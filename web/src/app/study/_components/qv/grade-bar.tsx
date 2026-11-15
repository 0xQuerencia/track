"use client";

import { useState, useTransition } from "react";
import { gradeAction, undoAction, type GradeResponse } from "../../vault-actions";
import { MISTAKE_CATEGORIES, RATINGS, RATING_HINT, STATE_LABEL, type Rating } from "@/lib/qv/constants";
import { ratingIcon } from "./ui";

/** Red / Yellow / Green in one click, with a note about the next review and an undo for slips. */
export function GradeBar({ questionId, compact = false }: { questionId: number; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<{ response: GradeResponse; undone: boolean } | null>(null);
  const [hint, setHint] = useState(false);
  const [mistake, setMistake] = useState("");

  const grade = (rating: Rating) =>
    start(async () => {
      const response = await gradeAction(questionId, rating, { hintUsed: hint, mistakeCategory: mistake || null });
      setLast({ response, undone: false });
    });
  const undo = () =>
    start(async () => {
      if (last?.response.ok) await undoAction(last.response.result.attemptId);
      setLast((l) => (l ? { ...l, undone: true } : l));
    });

  return (
    <div className="qv-grade" data-compact={compact || undefined}>
      <div className="qv-grade-row" role="group" aria-label="Grade this question">
        {RATINGS.map((rating) => {
          const Icon = ratingIcon[rating];
          return (
            <button key={rating} type="button" className="qv-rate" data-rating={rating} disabled={pending} onClick={() => grade(rating)} title={RATING_HINT[rating]}>
              <Icon size={14} aria-hidden="true" />
              {STATE_LABEL[rating]}
            </button>
          );
        })}
      </div>
      {!compact ? (
        <div className="qv-grade-extra">
          <label className="qv-check">
            <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} /> Needed a hint
          </label>
          <select aria-label="What went wrong" value={mistake} onChange={(e) => setMistake(e.target.value)}>
            <option value="">What went wrong? (optional)</option>
            {MISTAKE_CATEGORIES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div role="status" aria-live="polite" className="qv-note">
        {last?.response.ok && !last.undone ? (
          <>
            Marked {STATE_LABEL[last.response.result.state]}
            {last.response.result.downgraded ? " (a hint counts as yellow)" : ""}. Next review {last.response.result.nextReview} ({last.response.result.interval} d).{" "}
            <button type="button" className="qv-link" onClick={undo} disabled={pending}>
              Undo
            </button>
          </>
        ) : last?.undone ? (
          "Undone."
        ) : last && !last.response.ok ? (
          <span className="st-inline-error">{last.response.error}</span>
        ) : null}
      </div>
    </div>
  );
}
