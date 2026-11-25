export const identitySchema=`
CREATE TABLE social_accounts(
 id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_ms INTEGER NOT NULL, disabled_ms INTEGER
);
CREATE TABLE social_account_invites(
 hash TEXT PRIMARY KEY, expires_ms INTEGER NOT NULL, created_ms INTEGER NOT NULL, used_ms INTEGER
);
CREATE TABLE social_sessions(
 hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
 created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL
);
CREATE INDEX social_sessions_account ON social_sessions(account_id);
CREATE INDEX social_sessions_expiry ON social_sessions(expires_ms);
`;
