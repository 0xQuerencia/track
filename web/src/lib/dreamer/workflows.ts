import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type Session = { id: number; date: string; title: string };
type SourceKind = "ai_session" | "focus_session" | "study_session";
type Group = { kind: SourceKind; label: string; rows: Session[] };
const MAX_PER_GROUP = 30;

/** Local-only discovery. Session titles are metadata, NOT a transcript of what happened. */
export function discoverWorkflowCandidates(db: DatabaseSync): number {
  const ai = db.prepare("SELECT id, substr(COALESCE(last_activity_at, created_at_src, created_at),1,10) AS date, substr(COALESCE(title, project_hint, ''),1,150) AS title FROM ai_sessions ORDER BY id DESC LIMIT 350").all() as Session[];
  const focus = db.prepare("SELECT id, date, substr(COALESCE(label,''),1,150) AS title FROM focus_sessions ORDER BY id DESC LIMIT 350").all() as Session[];
  const study = db.prepare("SELECT id, date, substr(COALESCE(subject,''),1,150) AS title FROM study_sessions ORDER BY id DESC LIMIT 350").all() as Session[];
  const groups = new Map<string, Group>();
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  for (const [kind, rows] of [["ai_session",ai],["focus_session",focus],["study_session",study]] as const) {
    for (const row of rows) {
      const title = normalized(row.title);
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
      const intent = kind === "study_session" ? "revision:" + title :
        (title.match(/\b(review|audit|test|debug|fix|implement|build|plan|research|refactor|design|study|write|deploy|check)\b/)?.[0] || "");
      if (!intent) continue;
      const key = kind + ":" + intent;
      const group = groups.get(key) ?? { kind, label: intent, rows: [] };
      if (group.rows.length < MAX_PER_GROUP) group.rows.push(row);
      groups.set(key, group);
    }
  }
  let created = 0;
  const insert = db.prepare("INSERT OR IGNORE INTO dreamer_workflow_candidates (signature,title,source_kind,evidence_json,occurrences) VALUES (?,?,?,?,?)");
  for (const group of groups.values()) {
    if (group.rows.length < 3 || new Set(group.rows.map((s)=>s.date)).size < 2) continue;
    const signature = createHash("sha256").update(group.kind + ":" + group.label).digest("hex");
    const action = group.label.startsWith("revision:") ? "Review " + group.label.slice(9) + " study progress" : "Standardize recurring " + group.label + " work";
    const evidence = group.rows.slice(0,12).map((row) => ({ id: row.id, date: row.date, title: row.title }));
    created += Number(insert.run(signature, action, group.kind, JSON.stringify(evidence), group.rows.length).changes);
  }
  return created;
}

export type WorkflowCandidate = {
  id: number; title: string; sourceKind: string; occurrences: number; state: string;
  evidence: { id: number; date: string; title: string }[];
};
export function listCandidates(db: DatabaseSync): WorkflowCandidate[] {
  const rows = db.prepare("SELECT id,title,source_kind,occurrences,state,evidence_json FROM dreamer_workflow_candidates WHERE state != 'dismissed' ORDER BY id DESC LIMIT 12").all() as { id:number; title:string; source_kind:string; occurrences:number; state:string; evidence_json:string }[];
  return rows.map((row) => ({
    id: row.id, title: row.title, sourceKind: row.source_kind,
    occurrences: row.occurrences, state: row.state,
    evidence: JSON.parse(row.evidence_json) as WorkflowCandidate["evidence"],
  }));
}

export function saveCandidate(db: DatabaseSync, id: number): boolean {
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const row = db.prepare("SELECT id,title,source_kind,evidence_json,state FROM dreamer_workflow_candidates WHERE id=?").get(id) as
    { id: number; title:string; source_kind:string; evidence_json:string; state:string } | undefined;
  if (!row || row.state === "dismissed") return false;
  const spec = [
    "# " + row.title, "",
    "Status: draft — steps are NOT confirmed from session metadata.",
    "Trigger: manual only until explicitly configured.", "",
    "## Proposed skill",
    "1. Confirm what inputs, tools and permissions this recurring activity actually needs.",
    "2. Write the procedure with explicit safety boundaries and output format.",
    "3. Test against a real example and verify the result before scheduling.", "",
    "## Source",
    "Observed pattern in " + row.source_kind + " metadata; this is not a session transcript.",
    "Recorded examples: " + JSON.stringify(JSON.parse(row.evidence_json)),
  ].join("\n");
  db.prepare("INSERT OR IGNORE INTO dreamer_skills (candidate_id,name,spec_md) VALUES (?,?,?)").run(id,row.title,spec);
  db.prepare("UPDATE dreamer_workflow_candidates SET state='saved' WHERE id=?").run(id);
  return true;
}

export function dismissCandidate(db: DatabaseSync, id: number): boolean {
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  return Number(db.prepare("UPDATE dreamer_workflow_candidates SET state='dismissed' WHERE id=?").run(id).changes) > 0;
}

export function listSkills(db: DatabaseSync): { id:number; name:string; state:string; spec:string }[] {
  const rows = db.prepare("SELECT id,name,state,spec_md AS spec FROM dreamer_skills ORDER BY id DESC LIMIT 20").all() as { id:number; name:string; state:string; spec:string }[];
  return rows;
}

