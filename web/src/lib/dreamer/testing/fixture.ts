import type { DatabaseSync } from "node:sqlite";

/** Obviously fictitious sample records used only from Dreamer tests. */
export function seedFakeDreamerSources(db: DatabaseSync) {
  const project = db.prepare(`INSERT INTO projects (name, status, tags, tech_stack)
    VALUES ('Local Workbench', 'Active', 'workflow, deployment', 'TypeScript, Node')`).run();
  const first = db.prepare(`INSERT INTO journal_entries (date, title, tags, mood, energy, win, setback, text)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?)`)
    .run("2026-11-12", "Fictional deploy notes", "workflow", "I keep getting stuck when I deploy the Local Workbench. I should create a short checklist for deploy tasks. Could this workflow be simpler?");
  const second = db.prepare(`INSERT INTO journal_entries (date, title, tags, mood, energy, win, setback, text)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?)`)
    .run("2026-11-14", "Another fictional deploy note", "workflow", "I keep getting stuck when I deploy the Local Workbench. The deploy checklist takes time to rebuild. I want to improve this workflow.");
  const note = db.prepare(`INSERT INTO notes (title, body, kind, tags) VALUES (?, ?, ?, ?)`)
    .run("Fake workflow reference", "The Local Workbench uses TypeScript and Node. A deploy checklist could reuse the existing scripts.", "Note", "workflow, private-test");
  const idea = db.prepare(`INSERT INTO ideas (title, body, category, status, priority, tags, pinned, archived)
    VALUES (?, ?, 'Productivity', 'Inbox', 'Medium', 'workflow', 0, 0)`)
    .run("Fictional local checklist", "Idea: a local checklist for deploy setup with a small recovery step.");
  return {
    projectId: Number(project.lastInsertRowid),
    journalIds: [Number(first.lastInsertRowid), Number(second.lastInsertRowid)],
    noteId: Number(note.lastInsertRowid),
    ideaId: Number(idea.lastInsertRowid),
  };
}
