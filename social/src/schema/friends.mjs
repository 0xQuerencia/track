export const friendsSchema=`
CREATE TABLE social_friends(
 a TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
 b TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
 requested_by TEXT NOT NULL CHECK(requested_by=a OR requested_by=b),
 state TEXT NOT NULL CHECK(state IN ('pending','accepted')),
 updated_ms INTEGER NOT NULL,
 PRIMARY KEY(a,b), CHECK(a<b)
);
CREATE INDEX social_friends_b ON social_friends(b,state);
CREATE TABLE social_blocks(
 blocker TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
 blocked TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
 created_ms INTEGER NOT NULL, PRIMARY KEY(blocker,blocked), CHECK(blocker<>blocked)
);
CREATE TABLE social_reports(
 id TEXT PRIMARY KEY, reporter TEXT NOT NULL REFERENCES social_accounts(id),
 subject TEXT NOT NULL REFERENCES social_accounts(id),
 reason TEXT NOT NULL CHECK(reason IN ('spam','harassment','impersonation','other')),
 note TEXT NOT NULL, created_ms INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 CHECK(reporter<>subject)
);
CREATE UNIQUE INDEX social_reports_open ON social_reports(reporter,subject,reason) WHERE status='open';
`;
