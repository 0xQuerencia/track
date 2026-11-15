import type { Migration } from "./types";

// Owned by the Dreamer agent (dreamer_* tables). Additive only.
export const migration: Migration = {
  version: 120,
  name: "dreamer",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_sources (
      source TEXT NOT NULL CHECK (source IN ('journal', 'note', 'idea')),
      ref_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source, ref_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK (source IN ('journal', 'note', 'idea')),
      ref_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'excluded')),
      UNIQUE (source, ref_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES dreamer_documents(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      quote TEXT NOT NULL CHECK (length(quote) <= 200),
      start INTEGER NOT NULL,
      end INTEGER NOT NULL,
      date TEXT NOT NULL,
      polarity INTEGER NOT NULL DEFAULT 1 CHECK (polarity IN (-1, 0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES dreamer_documents(id) ON DELETE CASCADE,
      evidence_id INTEGER NOT NULL REFERENCES dreamer_evidence(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      tfidf REAL NOT NULL DEFAULT 0,
      UNIQUE (document_id, term)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      signature TEXT NOT NULL UNIQUE,
      text TEXT NOT NULL,
      original_text TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
      uncertainty_note TEXT NOT NULL,
      first_detected TEXT NOT NULL,
      last_confirmed TEXT NOT NULL,
      review_state TEXT NOT NULL DEFAULT 'new'
        CHECK (review_state IN ('new', 'accepted', 'corrected', 'dismissed', 'outdated', 'blocked')),
      user_text TEXT,
      origin TEXT NOT NULL DEFAULT 'rule' CHECK (origin IN ('rule', 'ai')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_insight_evidence (
      insight_id INTEGER NOT NULL REFERENCES dreamer_insights(id) ON DELETE CASCADE,
      evidence_id INTEGER NOT NULL REFERENCES dreamer_evidence(id) ON DELETE CASCADE,
      PRIMARY KEY (insight_id, evidence_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_insight_projects (
      insight_id INTEGER NOT NULL REFERENCES dreamer_insights(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (insight_id, project_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_kind TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_kind TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      polarity INTEGER NOT NULL DEFAULT 1 CHECK (polarity IN (-1, 0, 1)),
      weight REAL NOT NULL DEFAULT 0.5 CHECK (weight BETWEEN 0 AND 1),
      state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'confirmed', 'rejected')),
      evidence_json TEXT NOT NULL DEFAULT '[]',
      note TEXT,
      UNIQUE (from_kind, from_id, to_kind, to_id, relation)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('daily', 'weekly', 'manual')),
      period_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      ok INTEGER NOT NULL DEFAULT 0 CHECK (ok IN (0, 1)),
      new_insights INTEGER NOT NULL DEFAULT 0,
      new_suggestions INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      UNIQUE (kind, period_key)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      problem TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      usefulness TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      prototype TEXT NOT NULL,
      next_steps TEXT NOT NULL,
      uncertainties TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'rule' CHECK (origin IN ('rule', 'ai')),
      state TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      cycle_id INTEGER REFERENCES dreamer_runs(id) ON DELETE SET NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_suggestion_evidence (
      suggestion_id INTEGER NOT NULL REFERENCES dreamer_suggestions(id) ON DELETE CASCADE,
      evidence_id INTEGER NOT NULL REFERENCES dreamer_evidence(id) ON DELETE CASCADE,
      PRIMARY KEY (suggestion_id, evidence_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_suggestion_projects (
      suggestion_id INTEGER NOT NULL REFERENCES dreamer_suggestions(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (suggestion_id, project_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id INTEGER NOT NULL REFERENCES dreamer_suggestions(id) ON DELETE CASCADE,
      choice TEXT NOT NULL CHECK (choice IN ('useful', 'save_later', 'explore', 'convert_to_project', 'already_implemented', 'not_relevant', 'dont_suggest_again')),
      note TEXT,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS dreamer_briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('daily', 'weekly')),
      body_md TEXT NOT NULL,
      run_id INTEGER REFERENCES dreamer_runs(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kind, period_key)
    )`);

    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_documents_source ON dreamer_documents (source, status, processed_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_evidence_source ON dreamer_evidence (source, ref_id, date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_evidence_date ON dreamer_evidence (date, kind)`);
    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_terms_term ON dreamer_terms (term, document_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_insights_review ON dreamer_insights (review_state, kind, confidence DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_links_state ON dreamer_links (state, from_kind, to_kind)`);
    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_suggestions_state ON dreamer_suggestions (state, created_at DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS dreamer_runs_period ON dreamer_runs (kind, period_key DESC)`);
  },
};
