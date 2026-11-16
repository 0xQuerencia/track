"use client";

import { useActionState, useTransition } from "react";
import {
  createResourceAction,
  deleteResourceAction,
  updateResourceAction,
  type ActionState,
} from "../actions";
import { RESOURCE_KINDS } from "@/lib/projects/constants";
import type { ResourceRecord } from "@/lib/projects/resources";
import { safeHttpUrl } from "@/lib/projects/format";
import { Field, StatusLine } from "./fields";
import { FormSubmit } from "./form-submit";

function ResourceFields({ resource }: { resource?: ResourceRecord }) {
  return (
    <div className="tk-form-grid">
      <Field label="Kind">
        <select name="kind" defaultValue={resource?.kind ?? "Link"}>
          {RESOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </Field>
      <Field label="Title">
        <input name="title" required maxLength={200} defaultValue={resource?.title ?? ""} />
      </Field>
      <Field label="Link or reference" wide>
        <input
          name="url_or_ref"
          maxLength={500}
          defaultValue={resource?.url_or_ref ?? ""}
          placeholder="https://… for links, or a note such as a file name"
        />
      </Field>
      <Field label="Notes" wide>
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={resource?.notes ?? ""} />
      </Field>
    </div>
  );
}

function ResourceRow({ resource, projectId }: { resource: ResourceRecord; projectId: number }) {
  const [pending, startTransition] = useTransition();
  const boundUpdate = (previous: ActionState, formData: FormData) =>
    updateResourceAction(resource.id, projectId, previous, formData);
  const [state, action] = useActionState<ActionState, FormData>(boundUpdate, null);
  const link = safeHttpUrl(resource.url_or_ref);
  const remove = () =>
    startTransition(async () => {
      if (!window.confirm(`Delete “${resource.title}”?`)) return;
      await deleteResourceAction(resource.id, projectId);
    });

  return (
    <li className="pj-resource" aria-busy={pending || undefined}>
      <div className="pj-resource-head">
        <span className="pj-tag">{resource.kind}</span>
        <p className="pj-resource-title">
          {link ? (
            <a href={link} target="_blank" rel="noreferrer noopener">{resource.title}</a>
          ) : (
            resource.title
          )}
        </p>
        <button type="button" className="tk-button tk-ghost tk-danger" disabled={pending} onClick={remove}>Delete</button>
      </div>
      {resource.url_or_ref && !link ? <p className="pj-mono pj-resource-ref">{resource.url_or_ref}</p> : null}
      {resource.notes ? <p className="pj-resource-notes">{resource.notes}</p> : null}
      <details className="tk-add">
        <summary>Edit</summary>
        <form action={action} className="tk-form" aria-label={`Edit ${resource.title}`}>
          <ResourceFields resource={resource} />
          <div className="tk-form-actions">
            <FormSubmit label="Save resource" />
          </div>
          <StatusLine state={state} />
        </form>
      </details>
    </li>
  );
}

export function ResourcesPanel({ projectId, resources }: { projectId: number; resources: ResourceRecord[] }) {
  const boundCreate = (previous: ActionState, formData: FormData) =>
    createResourceAction(projectId, previous, formData);
  const [state, action] = useActionState<ActionState, FormData>(boundCreate, null);

  return (
    <div className="pj-resources">
      <details className="tk-add" open={resources.length === 0}>
        <summary>Add resource</summary>
        <form action={action} className="tk-form" aria-label="Add resource">
          <ResourceFields />
          <div className="tk-form-actions">
            <FormSubmit label="Add resource" />
          </div>
          <StatusLine state={state} />
        </form>
      </details>
      {resources.length === 0 ? (
        <p className="tk-empty">No resources yet. Add docs, links, screenshots or notes.</p>
      ) : (
        <ul className="pj-resource-list">
          {resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} projectId={projectId} />
          ))}
        </ul>
      )}
    </div>
  );
}
