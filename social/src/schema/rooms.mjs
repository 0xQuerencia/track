export const roomsSchema=`
CREATE TABLE social_rooms(
 id TEXT PRIMARY KEY, pod_id TEXT NOT NULL REFERENCES social_pods(id) ON DELETE CASCADE,
 host_id TEXT NOT NULL REFERENCES social_accounts(id), objective TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('lobby','running','ended')),
 scheduled_ms INTEGER, started_ms INTEGER, ended_ms INTEGER,
 revision INTEGER NOT NULL DEFAULT 0, created_ms INTEGER NOT NULL
);
CREATE INDEX social_rooms_pod ON social_rooms(pod_id,state,created_ms);
CREATE TABLE social_room_participants(
 room_id TEXT NOT NULL REFERENCES social_rooms(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
 joined_ms INTEGER NOT NULL, last_seen_ms INTEGER NOT NULL, left_ms INTEGER,
 ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
 PRIMARY KEY(room_id,account_id)
);
`;
