-- Robust room creation + lobby config columns.
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS max_participants INT NOT NULL DEFAULT 50;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS auto_record BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS lobby_timer_title TEXT;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS lobby_timer_seconds INT NOT NULL DEFAULT 300;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS lobby_bg_video TEXT;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS lobby_auto_admit BOOLEAN NOT NULL DEFAULT false;
