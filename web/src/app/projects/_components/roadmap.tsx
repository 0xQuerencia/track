"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createMilestoneAction,
  deleteMilestoneAction,
  moveMilestoneAction,
  setMilestoneStatusAction,
  type ActionState,
} from "../actions";
import { MILESTONE_STATUSES, type MilestoneStatus } from "@/lib/projects/constants";
import type { MilestoneRecord } from "@/lib/projects/detail";
import { formatWhen } from "@/lib/projects/format";
import { Field, StatusLine } from "./fields";
import { FormSubmit } from "./form-submit";

function MilestoneRow({
  milestone,
  projectId,
  isFirst,
  isLast,
}: {
  milestone: MilestoneRecord;
  projectId: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const changeStatus = (status: MilestoneStatus) =>
    startTransition(async () => {
      const result = await setMilestoneStatusAction(milestone.id, projectId, status);
      setError(result?.ok ? null : result?.message ?? "Could not save the status.");
    });
  const move = (direction: -1 | 1) => startTransition(() => moveMilestoneAction(milestone.id, projectId, direction));
  const remove = () =>
    startTransition(async () => {
      if (!window.confirm(`Delete milestone “${milestone.title}”?`)) return;
      await deleteMilestoneAction(milestone.id, projectId);
    });

  return (
    <li className="pj-milestone" data-status={milestone.status} aria-busy={pending || undefined}>
      <span className="pj-milestone-mark" aria-hidden="true" />
      <div className="pj-milestone-body">
        <p className="pj-milestone-title">{milestone.title}</p>
        <p className="pj-milestone-meta">
          {milestone.due_date ? `Due ${formatWhen(milestone.due_date)}` : "No date"}
          {milestone.completed_at ? ` · finished ${formatWhen(milestone.completed_at)}` : ""}
        </p>
        {error ? <p className="pj-status" role="alert" data-tone="error">{error}</p> : null}
      </div>
      <label className="pj-inline-select">
        <span className="pj-sr-only">Status of {milestone.title}</span>
        <select
          value={milestone.status}
          disabled={pending}
          onChange={(event) => changeStatus(event.target.value as MilestoneStatus)}
        >
          {MILESTONE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <div className="pj-milestone-actions">
        <button type="button" className="tk-button tk-ghost" disabled={pending || isFirst} onClick={() => move(-1)} aria-label={`Move ${milestone.title} up`}>↑</button>
        <button type="button" className="tk-button tk-ghost" disabled={pending || isLast} onClick={() => move(1)} aria-label={`Move ${milestone.title} down`}>↓</button>
        <button type="button" className="tk-button tk-ghost tk-danger" disabled={pending} onClick={remove}>Delete</button>
      </div>
    </li>
  );
}

export function Roadmap({ projectId, milestones }: { projectId: number; milestones: MilestoneRecord[] }) {
  const boundCreate = (previous: ActionState, formData: FormData) =>
    createMilestoneAction(projectId, previous, formData);
  const [state, action] = useActionState<ActionState, FormData>(boundCreate, null);

  return (
    <div className="pj-roadmap">
      <details className="tk-add" open={milestones.length === 0}>
        <summary>Add milestone</summary>
        <form action={action} className="tk-form" aria-label="Add milestone">
          <div className="tk-form-grid">
            <Field label="Milestone" wide>
              <input name="title" required maxLength={200} />
            </Field>
            <Field label="Target date">
              <input name="due_date" type="date" />
            </Field>
          </div>
          <div className="tk-form-actions">
            <FormSubmit label="Add milestone" />
          </div>
          <StatusLine state={state} />
        </form>
      </details>
      {milestones.length === 0 ? (
        <p className="tk-empty">No milestones yet. Progress appears here once you add some.</p>
      ) : (
        <ol className="pj-milestones">
          {milestones.map((milestone, index) => (
            <MilestoneRow
              key={milestone.id}
              milestone={milestone}
              projectId={projectId}
              isFirst={index === 0}
              isLast={index === milestones.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
