export const operationsSchema=`
ALTER TABLE social_reports ADD COLUMN resolved_ms INTEGER;
CREATE TABLE social_admin_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 action TEXT NOT NULL CHECK(action IN ('report_resolved')),
 subject_id TEXT NOT NULL, created_ms INTEGER NOT NULL
);
`;
