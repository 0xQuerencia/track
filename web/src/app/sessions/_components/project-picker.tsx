"use client";

import { useActionState } from "react";
import { ActionNotice } from "@/components/motion/action-notice";
import { setSessionProjectAction, type SessionActionState } from "../actions";

export type ProjectChoice = { id: number; name: string };

/** Pick or clear the project for one session. Unlinking blocks automatic re-linking. */
export function ProjectPicker({
  sessionId,
  currentProjectId,
  source,
  projects,
}: {
  sessionId: number;
  currentProjectId: number | null;
  source: "auto" | "manual" | null;
  projects: ProjectChoice[];
}) {
  const [state, action, pending] = useActionState<SessionActionState, FormData>(
    setSessionProjectAction,
    null,
  );
  const selectId = `project-${sessionId}`;
  const value =
    currentProjectId !== null ? String(currentProjectId) : source === "manual" ? "none" : "";
  return (
    <form action={action} className="ses-form">
      <input type="hidden" name="id" value={sessionId} />
      <label className="tk-field" htmlFor={selectId}>
        <span>Project</span>
        <select id={selectId} name="project" defaultValue={value} disabled={pending}>
          {currentProjectId === null && source !== "manual" ? (
            <option value="">Not linked</option>
          ) : null}
          <option value="none">No project (keep it unlinked)</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <p className="ses-hint">
        {source === "auto"
          ? "Linked automatically from the folder hint."
          : source === "manual"
            ? "Set by you. The importer will not change it."
            : "Not linked yet. The importer links it when the folder matches one project exactly."}
      </p>
      <button type="submit" className="tk-button tk-primary" disabled={pending}>
        Save project
      </button>
      {state ? (
        <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </ActionNotice>
      ) : null}
    </form>
  );
}
