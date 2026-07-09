-- Sala vinculada a uma atividade OpenPBL: ao host entrar, a aula (class-code)
-- é gerada automaticamente — como o pacote PRESENTATION fazia ao abrir.
ALTER TABLE video_rooms
  ADD COLUMN IF NOT EXISTS openpbl_activity_id TEXT;
