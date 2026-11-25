export const clockSchema=`
ALTER TABLE social_rooms ADD COLUMN config_json TEXT NOT NULL DEFAULT '{"focusMs":1500000,"shortBreakMs":300000,"longBreakMs":900000,"rounds":4,"longBreakEvery":4}';
ALTER TABLE social_rooms ADD COLUMN paused_ms INTEGER;
ALTER TABLE social_rooms ADD COLUMN paused_total_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE social_room_participants ADD COLUMN personal_paused INTEGER NOT NULL DEFAULT 0 CHECK(personal_paused IN (0,1));
`;
