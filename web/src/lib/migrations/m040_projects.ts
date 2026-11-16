import { addColumnIfMissing } from "./helpers";
import type { Migration } from "./types";

/*
 * Project hub schema. Additive only: existing `projects` and `project_items`
 * rows are kept, legacy columns stay, and new columns are added in place.
 *
 * Triggers record what really happened (a status change, an archive, a
 * milestone completed, a project created) no matter which code path wrote it,
 * so history never has to be invented later.
 */

const PROJECT_COLUMNS: readonly [string, string][] = [
  ["category", "TEXT"],
  ["description", "TEXT"],
  ["tags", "TEXT"],
  ["tech_stack", "TEXT"],
  ["local_path", "TEXT"],
  ["default_branch", "TEXT"],
  ["current_branch", "TEXT"],
  ["last_activity_at", "TEXT"],
  ["last_commit_sha", "TEXT"],
  ["last_commit_message", "TEXT"],
  ["last_commit_at", "TEXT"],
  ["milestone_date", "TEXT"],
  ["external_id", "TEXT"],
  ["source", "TEXT"],
  ["archived", "INTEGER NOT NULL DEFAULT 0"],
  ["pinned", "INTEGER NOT NULL DEFAULT 0"],
];

const ITEM_COLUMNS: readonly [string, string][] = [
  ["project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL"],
  ["priority", "TEXT"],
  ["due_date", "TEXT"],
  ["description", "TEXT"],
];

const TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned', 'Doing', 'Done')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS project_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('Doc', 'Link', 'Screenshot', 'Asset', 'Note')),
    title TEXT NOT NULL,
    url_or_ref TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS project_repo_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('commit', 'branch', 'pr', 'issue', 'release', 'worktree')),
    external_id TEXT NOT NULL,
    title TEXT,
    url TEXT,
    state TEXT,
    author TEXT,
    occurred_at TEXT,
    payload_json TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, kind, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS project_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('created', 'status', 'archived', 'unarchived', 'milestone')),
    detail TEXT,
    at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

const INDEXES: readonly string[] = [
  // A stable external identifier is unique where it is set; manual rows have none.
  `CREATE UNIQUE INDEX IF NOT EXISTS projects_external_id_unique
     ON projects (external_id) WHERE external_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS projects_status ON projects (status, archived)`,
  `CREATE INDEX IF NOT EXISTS project_items_project ON project_items (project_id, status)`,
  `CREATE INDEX IF NOT EXISTS project_milestones_project ON project_milestones (project_id, sort_order, id)`,
  `CREATE INDEX IF NOT EXISTS project_resources_project ON project_resources (project_id, id)`,
  `CREATE INDEX IF NOT EXISTS project_repo_events_project ON project_repo_events (project_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS project_history_project ON project_history (project_id, at)`,
];

/** Links backlog items to a project by exact name, only when that name is unambiguous. */
const BACKFILL_ITEM_PROJECT_IDS = `
  UPDATE project_items
  SET project_id = (SELECT p.id FROM projects p WHERE p.name = project_items.project)
  WHERE project_id IS NULL
    AND project IS NOT NULL
    AND (SELECT COUNT(*) FROM projects p WHERE p.name = project_items.project) = 1`;

const TRIGGERS: readonly string[] = [
  `CREATE TRIGGER IF NOT EXISTS projects_history_created AFTER INSERT ON projects
   BEGIN
     INSERT INTO project_history (project_id, kind, detail)
     VALUES (NEW.id, 'created',
       CASE WHEN NEW.source = 'import' THEN 'Imported from inventory' ELSE 'Added manually' END);
   END`,
  `CREATE TRIGGER IF NOT EXISTS projects_history_status AFTER UPDATE OF status ON projects
   WHEN OLD.status IS NOT NEW.status
   BEGIN
     INSERT INTO project_history (project_id, kind, detail)
     VALUES (NEW.id, 'status', COALESCE(OLD.status, 'none') || ' -> ' || COALESCE(NEW.status, 'none'));
   END`,
  `CREATE TRIGGER IF NOT EXISTS projects_history_archived AFTER UPDATE OF archived ON projects
   WHEN OLD.archived IS NOT NEW.archived
   BEGIN
     INSERT INTO project_history (project_id, kind)
     VALUES (NEW.id, CASE WHEN NEW.archived = 1 THEN 'archived' ELSE 'unarchived' END);
   END`,
  `CREATE TRIGGER IF NOT EXISTS projects_rename_items AFTER UPDATE OF name ON projects
   WHEN OLD.name IS NOT NEW.name
   BEGIN
     UPDATE project_items SET project = NEW.name WHERE project_id = NEW.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS projects_attach_items AFTER INSERT ON projects
   BEGIN
     UPDATE project_items SET project_id = NEW.id
     WHERE project_id IS NULL AND project = NEW.name
       AND (SELECT COUNT(*) FROM projects WHERE name = NEW.name) = 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS project_items_attach AFTER INSERT ON project_items
   WHEN NEW.project_id IS NULL
   BEGIN
     UPDATE project_items
     SET project_id = (SELECT p.id FROM projects p WHERE p.name = NEW.project)
     WHERE id = NEW.id
       AND (SELECT COUNT(*) FROM projects p WHERE p.name = NEW.project) = 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS projects_cleanup AFTER DELETE ON projects
   BEGIN
     DELETE FROM project_milestones WHERE project_id = OLD.id;
     DELETE FROM project_resources WHERE project_id = OLD.id;
     DELETE FROM project_repo_events WHERE project_id = OLD.id;
     DELETE FROM project_history WHERE project_id = OLD.id;
     UPDATE project_items SET project_id = NULL WHERE project_id = OLD.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS project_milestones_done AFTER UPDATE OF status ON project_milestones
   WHEN NEW.status = 'Done' AND OLD.status IS NOT 'Done'
   BEGIN
     INSERT INTO project_history (project_id, kind, detail)
     VALUES (NEW.project_id, 'milestone', NEW.title);
   END`,
];

export const migration: Migration = {
  version: 40,
  name: "projects",
  up(db) {
    for (const [column, type] of PROJECT_COLUMNS)
      addColumnIfMissing(db, "projects", column, `"${column}" ${type}`);
    for (const [column, type] of ITEM_COLUMNS)
      addColumnIfMissing(db, "project_items", column, `"${column}" ${type}`);
    for (const sql of TABLES) db.exec(sql);
    for (const sql of INDEXES) db.exec(sql);
    db.exec(BACKFILL_ITEM_PROJECT_IDS);
    for (const sql of TRIGGERS) db.exec(sql);
  },
};
