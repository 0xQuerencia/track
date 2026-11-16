"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addContributionAction,
  deleteGoalAction,
  moveGoalAction,
  removeContributionAction,
  setManualDoneAction,
  type ActionState,
} from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import type { SourceOption } from "@/lib/plans/contributions";

const GROUP_LABELS: Record<SourceOption["type"], string> = {
  task: "Open tasks",
  project: "Projects",
  chapter: "Study chapters",
  exam: "Exams",
  habit: "Habits",
  manual: "Manual",
};

/** Links a task, project, chapter, exam or habit to a goal, or adds a manual milestone. */
export function ContributionForm({ goalId, options }: { goalId: number; options: SourceOption[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addContributionAction, null);
  const [source, setSource] = useState("");
  const groups = (Object.keys(GROUP_LABELS) as SourceOption["type"][]).filter(
    (type) => type !== "manual" && options.some((option) => option.type === type),
  );
  return (
    <form action={action} className="tk-form pl-contribution-form">
      <input type="hidden" name="goalId" value={goalId} />
      <div className="tk-form-grid">
        <label className="tk-field" data-wide="true">
          <span>Link to</span>
          <select name="source" value={source} onChange={(event) => setSource(event.target.value)} required>
            <option value="" disabled>
              Choose a record
            </option>
            {groups.map((type) => (
              <optgroup key={type} label={GROUP_LABELS[type]}>
                {options
                  .filter((option) => option.type === type)
                  .map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value="manual">Manual milestone (type a name)</option>
          </select>
        </label>
        {source === "manual" ? (
          <label className="tk-field" data-wide="true">
            <span>Milestone</span>
            <input name="label" required maxLength={200} />
          </label>
        ) : null}
        <label className="tk-field">
          <span>Weight</span>
          <input name="weight" type="number" min={0.1} max={100} step="any" defaultValue={1} />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button" disabled={pending || source === ""}>
          {pending ? "Linking…" : "Link"}
        </button>
        {state ? (
          <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
            {state.message}
          </ActionNotice>
        ) : null}
      </div>
    </form>
  );
}

/** Ticks or unticks a manual milestone, and unlinks any contribution. */
export function ContributionRow({
  id,
  manual,
  done,
  label,
}: {
  id: number;
  manual: boolean;
  done: boolean;
  label: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="pl-contribution-actions">
      {manual ? (
        <label className="pl-check">
          <input
            type="checkbox"
            checked={done}
            disabled={pending}
            aria-label={`Done: ${label}`}
            onChange={(event) => {
              const next = event.target.checked;
              startTransition(async () => {
                const result = await setManualDoneAction(id, next);
                setMessage(result?.message ?? null);
              });
            }}
          />
          <span>Done</span>
        </label>
      ) : null}
      <button
        type="button"
        className="tk-button tk-ghost"
        disabled={pending}
        aria-label={`Unlink ${label}`}
        onClick={() =>
          startTransition(async () => {
            const result = await removeContributionAction(id);
            setMessage(result?.message ?? null);
          })
        }
      >
        Unlink
      </button>
      {message ? (
        <span className="pl-inline-status" role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}

/** Moves a goal under another goal (or to the top) and deletes it. */
export function GoalControls({
  goalId,
  title,
  currentParent,
  moveTargets,
}: {
  goalId: number;
  title: string;
  currentParent: number | null;
  moveTargets: { id: number; title: string }[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="pl-goal-controls">
      <label className="tk-field">
        <span>Parent</span>
        <select
          className="tk-inline"
          aria-label={`Parent of ${title}`}
          defaultValue={currentParent === null ? "" : String(currentParent)}
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value;
            startTransition(async () => {
              const result = await moveGoalAction(goalId, value === "" ? null : Number(value));
              setMessage(result?.message ?? null);
            });
          }}
        >
          <option value="">Top level</option>
          {moveTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="tk-button tk-ghost tk-danger"
        disabled={pending}
        aria-label={armed ? `Confirm delete ${title}` : `Delete ${title}`}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            window.setTimeout(() => setArmed(false), 3000);
            return;
          }
          startTransition(async () => {
            const result = await deleteGoalAction(goalId);
            setMessage(result?.message ?? null);
          });
        }}
      >
        {armed ? "Sure?" : "Delete goal"}
      </button>
      {message ? (
        <p className="pl-inline-status" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
