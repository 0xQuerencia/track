"use client";

import { useActionState } from "react";
import { createProjectAction, updateProjectAction, type ActionState } from "../actions";
import { PROJECT_STATUSES } from "@/lib/projects/constants";
import { Field, StatusLine } from "./fields";
import { FormSubmit } from "./form-submit";

export type ProjectFormDefaults = {
  name: string;
  status: string;
  category: string;
  repo: string;
  local_path: string;
  description: string;
  tags: string;
  tech_stack: string;
  milestone_date: string;
  notes: string;
  pinned: boolean;
};

/** Create a project (mode "create") or edit one (mode "edit", with its id). */
export function ProjectForm({
  mode,
  projectId,
  defaults,
}: {
  mode: "create" | "edit";
  projectId?: number;
  defaults: ProjectFormDefaults;
}) {
  const boundUpdate = (previous: ActionState, formData: FormData) =>
    updateProjectAction(projectId ?? 0, previous, formData);
  const [state, action] = useActionState<ActionState, FormData>(
    mode === "create" ? createProjectAction : boundUpdate,
    null,
  );

  return (
    <form action={action} className="tk-form" aria-label={mode === "create" ? "New project" : "Edit project"}>
      <div className="tk-form-grid">
        <Field label="Project name">
          <input name="name" required maxLength={120} defaultValue={defaults.name} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={defaults.status}>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <input name="category" maxLength={80} defaultValue={defaults.category} placeholder="app, game, tool" />
        </Field>
        <Field label="Repository URL">
          <input name="repo" type="url" maxLength={500} defaultValue={defaults.repo} placeholder="https://" />
        </Field>
        <Field label="Local path (reference only)">
          <input name="local_path" maxLength={500} defaultValue={defaults.local_path} className="pj-mono" />
        </Field>
        <Field label="Tags">
          <input name="tags" maxLength={2000} defaultValue={defaults.tags} placeholder="comma, separated" />
        </Field>
        <Field label="Tech stack">
          <input name="tech_stack" maxLength={2000} defaultValue={defaults.tech_stack} placeholder="comma, separated" />
        </Field>
        <Field label="Milestone date">
          <input name="milestone_date" type="date" defaultValue={defaults.milestone_date} />
        </Field>
        <Field label="Description" wide>
          <textarea name="description" rows={3} maxLength={2000} defaultValue={defaults.description} />
        </Field>
        <Field label="Notes" wide>
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={defaults.notes} />
        </Field>
        {mode === "create" ? (
          <label className="tk-field" data-type="boolean">
            <span>Pinned</span>
            <input name="pinned" type="checkbox" />
          </label>
        ) : null}
      </div>
      <div className="tk-form-actions">
        <FormSubmit label={mode === "create" ? "Add project" : "Save changes"} />
      </div>
      <StatusLine state={state} />
    </form>
  );
}
