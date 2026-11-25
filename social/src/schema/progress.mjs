export const progressSchema=`
CREATE TABLE social_progress(
 pod_id TEXT NOT NULL, account_id TEXT NOT NULL, day TEXT NOT NULL,
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 0 AND 1440),
 sessions INTEGER NOT NULL CHECK(sessions BETWEEN 0 AND 100), updated_ms INTEGER NOT NULL,
 PRIMARY KEY(pod_id,account_id,day), FOREIGN KEY(pod_id,account_id) REFERENCES social_pod_members(pod_id,account_id) ON DELETE CASCADE
);
CREATE INDEX social_progress_day ON social_progress(pod_id,day);
CREATE TABLE social_challenges(
 id TEXT PRIMARY KEY,pod_id TEXT NOT NULL REFERENCES social_pods(id) ON DELETE CASCADE,
 title TEXT NOT NULL,start_day TEXT NOT NULL,end_day TEXT NOT NULL,
 team_target_minutes INTEGER NOT NULL CHECK(team_target_minutes BETWEEN 10 AND 10000),
 UNIQUE(id,pod_id)
);
CREATE TABLE social_challenge_members(
 challenge_id TEXT NOT NULL,pod_id TEXT NOT NULL,account_id TEXT NOT NULL,
 PRIMARY KEY(challenge_id,account_id),
 FOREIGN KEY(challenge_id,pod_id) REFERENCES social_challenges(id,pod_id) ON DELETE CASCADE,
 FOREIGN KEY(pod_id,account_id) REFERENCES social_pod_members(pod_id,account_id) ON DELETE CASCADE
);
`;
