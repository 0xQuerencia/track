"use client";

import { useState, useTransition } from "react";
import { deleteProjectAction, setArchivedAction, setPinnedAction } from "../actions";

/** Archive, pin and delete for one project. Delete asks for confirmation and then leaves the page. */
export function ProjectControls({
  projectId,
  name,
  archived,
  pinned,
}: {
  projectId: number;
  name: string;
  archived: boolean;
  pinned: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (kind: "archive" | "pin") =>
    startTransition(async () => {
      const result =
        kind === "archive"
          ? await setArchivedAction(projectId, !archived)
          : await setPinnedAction(projectId, !pinned);
      setError(result?.ok ? null : result?.message ?? "Could not save.");
    });

  const remove = () =>
    startTransition(async () => {
      if (!window.confirm(`Delete “${name}”, its roadmap, resources and history? Backlog items are kept without a project.`)) return;
      await deleteProjectAction(projectId);
    });

  return (
    <div className="pj-controls" aria-busy={pending || undefined}>
      <button type="button" className="tk-button tk-ghost" aria-pressed={pinned} disabled={pending} onClick={() => toggle("pin")}>
        {pinned ? "Unpin" : "Pin"}
      </button>
      <button type="button" className="tk-button tk-ghost" disabled={pending} onClick={() => toggle("archive")}>
        {archived ? "Restore" : "Archive"}
      </button>
      <button type="button" className="tk-button tk-ghost tk-danger" disabled={pending} onClick={remove}>
        Delete project
      </button>
      {error ? <p className="pj-status" role="alert" data-tone="error">{error}</p> : null}
    </div>
  );
}
