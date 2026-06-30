-- Integração OpenPBL (SCORM): coleta opcional de e-mail dos participantes,
-- para casar com o progresso do pacote (interaction-events por studentEmail).
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS require_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE video_room_participants ADD COLUMN IF NOT EXISTS email TEXT;
