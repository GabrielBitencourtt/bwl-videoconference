-- Facilitador pode ocultar/reexibir o card do class-code para todos.
ALTER TABLE video_room_openpbl_class
  ADD COLUMN IF NOT EXISTS code_hidden BOOLEAN NOT NULL DEFAULT false;
