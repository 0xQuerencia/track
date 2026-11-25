export const presenceSchema=`
CREATE TABLE social_presence(
 account_id TEXT PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('available','focusing','break','away')),
 expires_ms INTEGER NOT NULL
);
CREATE INDEX social_presence_expiry ON social_presence(expires_ms);
`;
