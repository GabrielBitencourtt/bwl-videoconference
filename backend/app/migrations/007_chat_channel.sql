-- Chat por canal: NULL = sala principal; um groupId = chat daquele grupo (breakout).
ALTER TABLE video_room_chat_messages
  ADD COLUMN IF NOT EXISTS channel TEXT;

CREATE INDEX IF NOT EXISTS video_room_chat_channel_idx
  ON video_room_chat_messages(room_id, channel, created_at);
