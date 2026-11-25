export const chatSchema=`
CREATE TABLE social_room_messages(
 id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES social_rooms(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES social_accounts(id), client_id TEXT NOT NULL, body TEXT NOT NULL,
 created_ms INTEGER NOT NULL, removed_ms INTEGER, UNIQUE(room_id,author_id,client_id)
);
CREATE INDEX social_room_messages_room ON social_room_messages(room_id,id);
CREATE TABLE social_room_mutes(
 room_id TEXT NOT NULL REFERENCES social_rooms(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES social_accounts(id), muted_by TEXT NOT NULL REFERENCES social_accounts(id),
 created_ms INTEGER NOT NULL, PRIMARY KEY(room_id,account_id)
);
`;
