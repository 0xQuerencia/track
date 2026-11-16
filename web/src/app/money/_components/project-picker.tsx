"use client";

import { useState, useTransition } from "react";
import { setTransactionProjectAction } from "../actions";

/** Chooses the project a transaction is earned for. Saves on change. */
export function ProjectPicker({
  transactionId,
  projectId,
  projects,
}: {
  transactionId: number;
  projectId: number | null;
  projects: { id: number; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [value, setValue] = useState(projectId === null ? "" : String(projectId));

  const save = (raw: string) => {
    const next = raw === "" ? null : Number(raw);
    setValue(raw);
    startTransition(async () => {
      const result = await setTransactionProjectAction(transactionId, next);
      setFailed(!result?.ok);
    });
  };

  return (
    <select
      className="tk-inline money-project-picker"
      aria-label={`Project for transaction ${transactionId}`}
      aria-invalid={failed || undefined}
      value={value}
      disabled={pending}
      onChange={(event) => save(event.target.value)}
    >
      <option value="">No project</option>
      {projects.map((project) => (
        <option key={project.id} value={String(project.id)}>
          {project.name}
        </option>
      ))}
      {projectId !== null && !projects.some((project) => project.id === projectId) ? (
        <option value={String(projectId)}>Missing project #{projectId}</option>
      ) : null}
    </select>
  );
}
