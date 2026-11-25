export const podsSchema=`
CREATE TABLE social_pods(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, created_ms INTEGER NOT NULL
);
CREATE TABLE social_pod_members(
 pod_id TEXT NOT NULL REFERENCES social_pods(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('owner','moderator','member')),
 joined_ms INTEGER NOT NULL, PRIMARY KEY(pod_id,account_id)
);
CREATE UNIQUE INDEX social_pod_owner ON social_pod_members(pod_id) WHERE role='owner';
CREATE INDEX social_pod_members_account ON social_pod_members(account_id,pod_id);
CREATE TABLE social_pod_invites(
 hash TEXT PRIMARY KEY, pod_id TEXT NOT NULL REFERENCES social_pods(id) ON DELETE CASCADE,
 issuer TEXT NOT NULL REFERENCES social_accounts(id), recipient TEXT NOT NULL REFERENCES social_accounts(id),
 expires_ms INTEGER NOT NULL, used_ms INTEGER
);
CREATE INDEX social_pod_invites_pod ON social_pod_invites(pod_id,expires_ms);
`;
