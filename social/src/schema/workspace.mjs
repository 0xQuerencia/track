export const workspaceSchema=`
CREATE TABLE social_workspace(
 id TEXT PRIMARY KEY, pod_id TEXT NOT NULL, author_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('task','resource','event','flashcard')),
 title TEXT NOT NULL, detail TEXT NOT NULL, url TEXT, starts_ms INTEGER,
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0, created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL,
 FOREIGN KEY(pod_id,author_id) REFERENCES social_pod_members(pod_id,account_id) ON DELETE CASCADE
);
CREATE INDEX social_workspace_pod ON social_workspace(pod_id,kind,updated_ms);
`;
