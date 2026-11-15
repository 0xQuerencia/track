"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { convertIdeaAction } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import type { ConvertResult } from "@/lib/ideas/convert";

type Duplicate = { id: number; name: string };

/**
 * Turns an idea into a project. The user sees exactly what will be copied and
 * can leave out the description or repository. A project with the same name is
 * not created twice: the panel offers to link to it instead.
 */
export function ConvertPanel({
  ideaId,
  defaultName,
  defaultNotes,
  statuses,
}: {
  ideaId: number;
  defaultName: string;
  defaultNotes: string;
  statuses: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(defaultName);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [notes, setNotes] = useState(defaultNotes);
  const [includeRepo, setIncludeRepo] = useState(false);
  const [repo, setRepo] = useState("");
  const [status, setStatus] = useState(statuses.includes("Idea") ? "Idea" : (statuses[0] ?? ""));
  const [milestone, setMilestone] = useState("");
  const [markBuilding, setMarkBuilding] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  const payload = (linkExistingProjectId: number | null) => ({
    name,
    notes: includeNotes ? notes : "",
    repo: includeRepo ? repo : "",
    status,
    milestone,
    markBuilding,
    linkExistingProjectId,
  });

  const submit = (linkExistingProjectId: number | null) => {
    const values = payload(linkExistingProjectId);
    startTransition(async () => {
      const outcome: ConvertResult = await convertIdeaAction(ideaId, values);
      if (outcome.ok) {
        setDuplicate(null);
        setResult({
          ok: true,
          message: outcome.created ? "Project created and linked to this idea." : "Linked to the existing project.",
        });
        router.refresh();
        return;
      }
      setDuplicate(outcome.duplicate ?? null);
      setResult({ ok: false, message: outcome.error });
    });
  };

  return (
    <section className="tk-panel id-convert" aria-labelledby="convert-heading">
      <header className="tk-panel-head">
        <div>
          <h2 id="convert-heading">Convert to project</h2>
          <p>Creates one project from the fields below. The idea stays where it is and is linked to the project.</p>
        </div>
      </header>
      <form
        className="id-convert-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(null);
        }}
      >
        <div className="tk-form-grid">
          <label className="tk-field">
            <span>Project name</span>
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="tk-field">
            <span>Project status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="tk-field">
            <span>Next milestone (optional)</span>
            <input maxLength={200} value={milestone} onChange={(e) => setMilestone(e.target.value)} />
          </label>
          <div className="tk-field id-wide">
            <label className="id-check">
              <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
              <span>Copy the description (stored as project notes)</span>
            </label>
            <textarea
              aria-label="Project description"
              rows={3}
              maxLength={4000}
              value={notes}
              disabled={!includeNotes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="tk-field id-wide">
            <label className="id-check">
              <input type="checkbox" checked={includeRepo} onChange={(e) => setIncludeRepo(e.target.checked)} />
              <span>Add a repository link</span>
            </label>
            <input
              type="url"
              aria-label="Repository URL"
              placeholder="https://"
              maxLength={2000}
              value={repo}
              disabled={!includeRepo}
              onChange={(e) => setRepo(e.target.value)}
            />
          </div>
          <label className="id-check id-wide">
            <input type="checkbox" checked={markBuilding} onChange={(e) => setMarkBuilding(e.target.checked)} />
            <span>Also set this idea&rsquo;s status to Building</span>
          </label>
        </div>
        <p className="id-convert-preview">
          Will create a project named <strong>{name.trim() || "…"}</strong> with status <strong>{status}</strong>
          {includeNotes && notes.trim() ? ", the description, " : ", "}
          {includeRepo && repo.trim() ? "and the repository link. " : ""}
          The idea is kept.
        </p>
        <div className="tk-form-actions">
          <button type="submit" className="tk-button tk-primary" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create project"}
          </button>
          {duplicate ? (
            <button
              type="button"
              className="tk-button tk-ghost"
              disabled={pending}
              onClick={() => submit(duplicate.id)}
            >
              Link to “{duplicate.name}” instead
            </button>
          ) : null}
        </div>
        {result ? (
          <ActionNotice tone={result.ok ? "info" : "error"} role={result.ok ? "status" : "alert"}>
            {result.message}
          </ActionNotice>
        ) : null}
      </form>
    </section>
  );
}
